'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { toast } from 'sonner';
import { IconUserPlus, IconHistory, IconCreditCard, IconLoader2, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { getAllConflicts } from '@/lib/utils/eventConflicts';

interface RecentRegistration {
    orderId: string;
    name: string;
    email: string;
    passType: string;
    status: 'pending' | 'success' | 'failed';
    createdAt: Date;
}

export default function OnSpotRegistrationPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [recentRegistrations, setRecentRegistrations] = useState<RecentRegistration[]>([]);

    const [events, setEvents] = useState<any[]>([]);
    const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
    const [fetchingEvents, setFetchingEvents] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        college: '',
        passType: 'day_pass',
        paymentMethod: 'upi'
    });

    // Fetch Events
    useEffect(() => {
        const fetchEvents = async () => {
            if (!user) return; // Wait for user to be loaded
            setFetchingEvents(true);
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/admin/events?activeOnly=1', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data.events || []);
                }
            } catch (err) {
                console.error("Failed to fetch events", err);
            } finally {
                setFetchingEvents(false);
            }
        };
        fetchEvents();
    }, [user]);

    // Filter Events by Pass Type (Day Pass -> individual, Group Events -> group)
    const filteredEvents = React.useMemo(() => {
        if (formData.passType === 'day_pass') {
            return events.filter(e => e.type === 'individual');
        }
        if (formData.passType === 'group_events') {
            return events.filter(e => e.type === 'group');
        }
        return events; // Fallback or for test_pass
    }, [events, formData.passType]);

    // Calculate Conflicting Events
    const conflictingEventIds = React.useMemo(() => {
        if (!selectedEventIds.length || !events.length) return new Set<string>();
        const selectedEvts = events.filter(e => selectedEventIds.includes(e.id));
        return getAllConflicts(selectedEvts, events);
    }, [selectedEventIds, events, getAllConflicts]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'passType') {
            setSelectedEventIds([]);
        }
    };

    const toggleEventSelection = (eventId: string, isConflicting: boolean) => {
        if (isConflicting && !selectedEventIds.includes(eventId)) return;

        setSelectedEventIds(prev =>
            prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (['day_pass', 'group_events', 'test_pass'].includes(formData.passType) && selectedEventIds.length === 0) {
            toast.error("Please select at least one event.");
            return;
        }

        setLoading(true);
        try {
            const token = await user.getIdToken();

            if (formData.paymentMethod === 'cash') {
                // Cash Flow
                const res = await fetch('/api/admin/onspot/process-cash', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ ...formData, selectedEvents: selectedEventIds })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to process cash payment');

                const newReg: RecentRegistration = {
                    orderId: data.orderId,
                    name: formData.name, email: formData.email, passType: formData.passType,
                    status: 'success', createdAt: new Date()
                };
                setRecentRegistrations(prev => [newReg, ...prev]);
                toast.success('Registration successful! Pass issued.');

            } else {
                // 1. Create On-Spot Order (UPI Flow)
                const res = await fetch('/api/admin/onspot/create-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        ...formData,
                        selectedEvents: selectedEventIds
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to create order');

                const { orderId, paymentSessionId } = data;

                // Add to recent activity as pending
                const newReg: RecentRegistration = {
                    orderId,
                    name: formData.name,
                    email: formData.email,
                    passType: formData.passType,
                    status: 'pending',
                    createdAt: new Date()
                };
                setRecentRegistrations(prev => [newReg, ...prev]);

                // 2. Open Cashfree Checkout
                const { openCashfreeCheckout } = await import('@/features/payments/cashfreeClient.js');
                const checkoutResult = await openCashfreeCheckout(paymentSessionId);

                if (checkoutResult.error) {
                    updateStatus(orderId, 'failed');
                    throw new Error(checkoutResult.error.message || 'Payment modal failed');
                }

                // 3. Verify Payment
                toast.info('Verifying payment...');
                const verifyRes = await fetch('/api/admin/onspot/verify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ orderId })
                });

                const verifyData = await verifyRes.json();
                if (!verifyRes.ok) {
                    updateStatus(orderId, 'failed');
                    throw new Error(verifyData.error || 'Verification failed');
                }

                toast.success('Registration successful! Pass issued.');
                updateStatus(orderId, 'success');
            }

            // Clear form
            setFormData({
                name: '',
                email: '',
                phone: '',
                college: '',
                passType: 'day_pass',
                paymentMethod: 'upi'
            });
            setSelectedEventIds([]);

        } catch (err: any) {
            toast.error(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = (orderId: string, status: 'success' | 'failed') => {
        setRecentRegistrations(prev =>
            prev.map(reg => reg.orderId === orderId ? { ...reg, status } : reg)
        );
    };

    const showEventSelection = ['day_pass', 'group_events', 'test_pass'].includes(formData.passType);

    return (
        <div className="max-w-6xl mx-auto space-y-8 fade-in p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <IconUserPlus size={32} className="text-zinc-400" />
                        On-Spot Registration
                    </h1>
                    <p className="text-zinc-500 mt-2">
                        Quickly register students and take immediate payments.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Registration Form */}
                <div className="lg:col-span-2 space-y-6">
                    <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 space-y-6 shadow-xl backdrop-blur-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Full Name</label>
                                <input
                                    required
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    placeholder="e.g. John Doe"
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-zinc-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder="e.g. john@example.com"
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-zinc-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Phone Number</label>
                                <input
                                    required
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    placeholder="e.g. 9876543210"
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-zinc-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">College Name</label>
                                <input
                                    required
                                    type="text"
                                    name="college"
                                    value={formData.college}
                                    onChange={handleInputChange}
                                    placeholder="e.g. IIT Madras"
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-zinc-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pass Type</label>
                                <select
                                    name="passType"
                                    value={formData.passType}
                                    onChange={handleInputChange}
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="day_pass">Day Pass - ₹500</option>
                                    <option value="group_events">Group Events - ₹500</option>
                                    <option value="sana_concert">Sana Concert - ₹2000</option>
                                    <option value="test_pass">Test Pass - ₹1</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Payment Method</label>
                                <select
                                    name="paymentMethod"
                                    value={formData.paymentMethod}
                                    onChange={handleInputChange}
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="upi">UPI (Cashfree Link)</option>
                                    <option value="cash">Cash (Direct Approval)</option>
                                </select>
                            </div>
                        </div>

                        {/* Event Selection Map */}
                        {showEventSelection && (
                            <div className="space-y-3 pt-4 border-t border-zinc-800">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    Select Events {selectedEventIds.length > 0 && <span className="text-blue-400 font-normal normal-case ml-2">({selectedEventIds.length} selected)</span>}
                                </label>

                                {fetchingEvents ? (
                                    <div className="flex items-center gap-2 text-zinc-500 py-4">
                                        <IconLoader2 className="animate-spin" size={18} />
                                        <span className="text-sm">Loading available events...</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                                        {filteredEvents.map((evt) => {
                                            const isSelected = selectedEventIds.includes(evt.id);
                                            const isConflicting = conflictingEventIds.has(evt.id) && !isSelected;

                                            return (
                                                <button
                                                    key={evt.id}
                                                    type="button"
                                                    disabled={isConflicting}
                                                    onClick={() => toggleEventSelection(evt.id, isConflicting)}
                                                    className={`
                                                        text-left p-3 rounded-xl border transition-all duration-200 flex flex-col gap-1 relative overflow-hidden
                                                        ${isSelected
                                                            ? 'border-blue-500/50 bg-blue-500/10'
                                                            : isConflicting
                                                                ? 'border-red-900/30 bg-red-950/10 opacity-50 cursor-not-allowed'
                                                                : 'border-zinc-800 bg-black/40 hover:border-zinc-700 hover:bg-black/60'}
                                                    `}
                                                >
                                                    <div className="flex items-start justify-between w-full">
                                                        <span className={`text-sm font-medium pr-2 truncate ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                                            {evt.name}
                                                        </span>
                                                        <div className={`
                                                            w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors
                                                            ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-zinc-700'}
                                                        `}>
                                                            {isSelected && <div className="w-full h-full rounded-full bg-blue-500 border-[2px] border-black" />}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono flex-wrap">
                                                        <span>{evt.category?.toUpperCase()}</span>
                                                        {(evt.startTime || evt.endTime) && (
                                                            <>
                                                                <span>•</span>
                                                                <span className={isConflicting ? 'text-red-400' : ''}>
                                                                    {evt.startTime}{evt.endTime && ` - ${evt.endTime}`}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {filteredEvents.length === 0 && (
                                            <div className="col-span-1 sm:col-span-2 border border-dashed border-zinc-800 rounded-xl p-4 text-center text-zinc-600 text-sm">
                                                No active events found for this pass type.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (showEventSelection && selectedEventIds.length === 0)}
                            className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-[0.98]"
                        >
                            {loading ? (
                                <IconLoader2 className="animate-spin" size={24} />
                            ) : (
                                <>
                                    <IconCreditCard size={24} />
                                    Pay & Register
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Recent Activity */}
                <div className="space-y-6">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm h-full max-h-[600px] overflow-hidden flex flex-col">
                        <div className="flex items-center gap-2 mb-6">
                            <IconHistory size={20} className="text-zinc-400" />
                            <h2 className="font-semibold text-white tracking-tight">Recent On-Spot</h2>
                        </div>

                        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            {recentRegistrations.length === 0 ? (
                                <div className="text-center py-12 space-y-2">
                                    <p className="text-zinc-600 text-sm italic">No registrations yet in this session</p>
                                </div>
                            ) : (
                                recentRegistrations.map((reg) => (
                                    <div key={reg.orderId} className="bg-black/40 border border-zinc-800/50 rounded-xl p-4 space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-white max-w-[140px] truncate">{reg.name}</p>
                                                <p className="text-xs text-zinc-500 truncate max-w-[140px]">{reg.email}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                {reg.status === 'pending' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-bold uppercase tracking-tighter animate-pulse">Pending</span>}
                                                {reg.status === 'success' && <IconCircleCheck size={18} className="text-green-500" />}
                                                {reg.status === 'failed' && <IconCircleX size={18} className="text-red-500" />}
                                                <span className="text-[10px] text-zinc-600">{new Date(reg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/30">
                                            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{reg.passType.replace('_', ' ')}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
