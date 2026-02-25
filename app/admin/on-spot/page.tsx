'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { toast } from 'sonner';
import { IconUserPlus, IconHistory, IconCreditCard, IconLoader2, IconCircleCheck, IconCircleX, IconPlus, IconTrash } from '@tabler/icons-react';
import { getAllConflicts, getConflictWarnings, type EventWithTiming } from '@/lib/utils/eventConflicts';
import type { AdminEvent } from '@/types/admin';

const DEFAULT_GROUP_PRICE_PER_PERSON = 250;
const DEFAULT_MIN_MEMBERS = 1;
const DEFAULT_MAX_MEMBERS = 99;

interface Member {
    name: string;
    phone: string;
    email: string;
    isLeader: boolean;
}

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

    const [events, setEvents] = useState<AdminEvent[]>([]);
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

    // Day Pass: filter events by selected day (from DB event.date)
    const [selectedDay, setSelectedDay] = useState('');

    // Group Events: one pass per team; price and limits from selected event(s) in DB
    const [teamName, setTeamName] = useState('');
    const [members, setMembers] = useState<Member[]>([
        { name: '', phone: '', email: '', isLeader: true }
    ]);

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

    // Event filtering from DB: allowedPassTypes, isActive, !isArchived; day_pass also by event.date
    const filteredEvents = React.useMemo(() => {
        return events.filter((event) => {
            if (event.isArchived === true || event.isActive === false) return false;
            const allowed = event.allowedPassTypes ?? [];
            if (formData.passType === 'day_pass') {
                if (!allowed.includes('day_pass') || selectedDay === '') return false;
                const eventDates = event.dates?.length ? event.dates : (event.date ? [event.date] : []);
                return eventDates.includes(selectedDay);
            }
            if (formData.passType === 'group_events') {
                if (!allowed.includes('group_events')) return false;
                if (selectedDay === '') return false;
                const eventDates = event.dates?.length ? event.dates : (event.date ? [event.date] : []);
                return eventDates.includes(selectedDay);
            }
            if (formData.passType === 'sana_concert') {
                return allowed.includes('sana_concert');
            }
            if (formData.passType === 'test_pass') {
                return allowed.includes('test_pass');
            }
            return false;
        });
    }, [events, formData.passType, selectedDay]);

    // Unique dates for day selector: day_pass, group_events, sana_concert
    const dayPassDates = React.useMemo(() => {
        const out = new Set<string>();
        events
            .filter((e) => e.isArchived !== true && e.isActive !== false && (e.allowedPassTypes ?? []).includes('day_pass'))
            .forEach((e) => {
                if (e.dates?.length) e.dates.forEach((d) => out.add(d));
                else if (e.date) out.add(e.date);
            });
        return Array.from(out).sort();
    }, [events]);

    const groupEventsDates = React.useMemo(() => {
        const out = new Set<string>();
        events
            .filter((e) => e.isArchived !== true && e.isActive !== false && (e.allowedPassTypes ?? []).includes('group_events'))
            .forEach((e) => {
                if (e.dates?.length) e.dates.forEach((d) => out.add(d));
                else if (e.date) out.add(e.date);
            });
        return Array.from(out).sort();
    }, [events]);

    const hasDateFilter = formData.passType === 'day_pass' || formData.passType === 'group_events';
    const effectiveDateForConflicts = hasDateFilter ? selectedDay : undefined;

    // When switching to day_pass or group_events, auto-select first available day if none selected
    useEffect(() => {
        if (formData.passType === 'day_pass' && dayPassDates.length > 0 && !selectedDay) {
            setSelectedDay(dayPassDates[0]);
        }
        if (formData.passType === 'group_events' && groupEventsDates.length > 0 && !selectedDay) {
            setSelectedDay(groupEventsDates[0]);
        }
        if (!hasDateFilter) {
            setSelectedDay('');
        }
    }, [formData.passType, dayPassDates, groupEventsDates, selectedDay, hasDateFilter]);

    // Clear event selection when date changes (day_pass / group_events only)
    const prevSelectedDayRef = React.useRef(selectedDay);
    useEffect(() => {
        if (prevSelectedDayRef.current !== selectedDay && hasDateFilter) {
            setSelectedEventIds([]);
        }
        prevSelectedDayRef.current = selectedDay;
    }, [selectedDay, hasDateFilter]);

    // Map AdminEvent to EventWithTiming for conflict detection (effective date for day/group; dates for sana)
    const toEventWithTiming = React.useCallback((e: AdminEvent, effectiveDate?: string): EventWithTiming => ({
        id: e.id,
        name: e.name,
        date: effectiveDate ?? e.date,
        dates: e.dates?.length ? e.dates : undefined,
        startTime: e.startTime,
        endTime: e.endTime,
        venue: e.venue,
    }), []);

    // Conflicting events: share a date + overlapping time
    const conflictingEventIds = React.useMemo(() => {
        if (!selectedEventIds.length || filteredEvents.length === 0) return new Set<string>();
        const selectedEvts = filteredEvents.filter((e) => selectedEventIds.includes(e.id));
        const withTiming = selectedEvts.map((e) => toEventWithTiming(e, effectiveDateForConflicts));
        const availableWithTiming = filteredEvents.map((e) => toEventWithTiming(e, effectiveDateForConflicts));
        return getAllConflicts(withTiming, availableWithTiming);
    }, [selectedEventIds, filteredEvents, effectiveDateForConflicts, toEventWithTiming]);

    // Sana Pass: group events by date for sectioned layout (no day selector)
    const sanaGroupedByDate = React.useMemo(() => {
        if (formData.passType !== 'sana_concert') return {};
        const sanaEvents = filteredEvents;
        const grouped: Record<string, AdminEvent[]> = {};
        sanaEvents.forEach((event) => {
            const eventDates = event.dates?.length ? event.dates : (event.date ? [event.date] : []);
            eventDates.forEach((d) => {
                if (!grouped[d]) grouped[d] = [];
                grouped[d].push(event);
            });
        });
        Object.keys(grouped).sort().forEach((d) => {
            grouped[d] = Array.from(new Map(grouped[d].map((e) => [e.id, e])).values());
        });
        return grouped;
    }, [formData.passType, filteredEvents]);

    const formatDateHeader = (dateStr: string) => {
        const parts = dateStr.split(/[/-]/);
        if (parts.length >= 3) {
            const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
            const day = parts[0];
            const month = months[parseInt(parts[1], 10) - 1] ?? dateStr;
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${day} ${month} ${year}`;
        }
        return dateStr;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'passType') {
            setSelectedEventIds([]);
            if (value === 'group_events') {
                setTeamName('');
                setMembers([{ name: formData.name, phone: formData.phone, email: formData.email, isLeader: true }]);
            } else {
                setTeamName('');
                setMembers([{ name: '', phone: '', email: '', isLeader: true }]);
            }
        }
        // Keep leader (first member) in sync when group_events
        if (formData.passType === 'group_events' && (name === 'name' || name === 'phone' || name === 'email')) {
            setMembers(prev => {
                const next = [...prev];
                if (next.length) next[0] = { ...next[0], [name]: value };
                return next;
            });
        }
    };

    const showTeamSection = formData.passType === 'group_events';
    const totalMembers = members.length;

    // Group events: limits and price from selected event(s) in DB (strictest limits across selection)
    const selectedGroupEvents = React.useMemo(
        () => events.filter((e) => selectedEventIds.includes(e.id) && (e.allowedPassTypes ?? []).includes('group_events')),
        [events, selectedEventIds]
    );
    const teamLimits = React.useMemo(() => {
        if (selectedGroupEvents.length === 0) {
            return { minMembers: DEFAULT_MIN_MEMBERS, maxMembers: DEFAULT_MAX_MEMBERS, pricePerPerson: DEFAULT_GROUP_PRICE_PER_PERSON };
        }
        let min = DEFAULT_MIN_MEMBERS;
        let max = DEFAULT_MAX_MEMBERS;
        let price = DEFAULT_GROUP_PRICE_PER_PERSON;
        for (const e of selectedGroupEvents) {
            const tc = e.teamConfig;
            if (tc) {
                min = Math.max(min, tc.minMembers);
                max = Math.min(max, tc.maxMembers);
                price = tc.pricePerPerson;
            }
        }
        return { minMembers: min, maxMembers: max, pricePerPerson: price };
    }, [selectedGroupEvents]);

    const groupEventsAmount = totalMembers * teamLimits.pricePerPerson;

    const addMember = () => {
        if (totalMembers >= teamLimits.maxMembers) return;
        setMembers(prev => [...prev, { name: '', phone: '', email: '', isLeader: false }]);
    };

    const updateMember = (index: number, field: keyof Member, value: string | boolean) => {
        setMembers(prev => {
            const next = [...prev];
            if (index < 0 || index >= next.length) return prev;
            next[index] = { ...next[index], [field]: value };
            if (field === 'name' && index === 0) setFormData(f => ({ ...f, name: value as string }));
            if (field === 'phone' && index === 0) setFormData(f => ({ ...f, phone: value as string }));
            if (field === 'email' && index === 0) setFormData(f => ({ ...f, email: value as string }));
            return next;
        });
    };

    const removeMember = (index: number) => {
        if (members.length <= 1) return;
        setMembers(prev => prev.filter((_, i) => i !== index));
    };

    const membersValid = members.every(m => m.name.trim().length > 0 && m.phone.trim().length > 0);
    const membersInRange = totalMembers >= teamLimits.minMembers && totalMembers <= teamLimits.maxMembers;
    const canSubmitGroupEvents = showTeamSection
        ? (teamName.trim().length > 0 && selectedEventIds.length >= 1 && members.length >= 1 && membersValid && membersInRange)
        : true;

    const toggleEventSelection = (eventId: string, isConflicting: boolean, conflictWithNames?: string[]) => {
        if (isConflicting && !selectedEventIds.includes(eventId)) {
            const msg = conflictWithNames?.length
                ? `Time clash with ${conflictWithNames.join(', ')}.`
                : 'This event conflicts with another selected event.';
            toast.error(msg);
            return;
        }

        setSelectedEventIds(prev =>
            prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (['day_pass', 'group_events', 'sana_concert', 'test_pass'].includes(formData.passType) && selectedEventIds.length === 0) {
            toast.error("Please select at least one event.");
            return;
        }

        if (showTeamSection) {
            if (!teamName.trim()) {
                toast.error("Please enter team name.");
                return;
            }
            if (members.length < 1 || !membersValid) {
                toast.error("Please add at least one member with name and phone.");
                return;
            }
        }

        setLoading(true);
        try {
            const token = await user.getIdToken();

            const payload: Record<string, unknown> = {
                ...formData,
                selectedEvents: selectedEventIds,
            };
            if (showTeamSection) {
                payload.teamName = teamName.trim();
                payload.members = members.map((m, i) => ({
                    name: m.name.trim(),
                    phone: m.phone.trim(),
                    email: (m.email || '').trim() || undefined,
                    isLeader: i === 0,
                }));
                payload.amount = groupEventsAmount;
                payload.pricePerPerson = teamLimits.pricePerPerson;
            }

            if (formData.paymentMethod === 'cash') {
                // Cash Flow
                const res = await fetch('/api/admin/onspot/process-cash', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
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
                    body: JSON.stringify(payload)
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
            setTeamName('');
            setMembers([{ name: '', phone: '', email: '', isLeader: true }]);

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

    const showEventSelection = ['day_pass', 'group_events', 'sana_concert', 'test_pass'].includes(formData.passType);

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
                                    <option value="group_events">Group Events - ₹250 per person</option>
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

                        {/* Day / Date: select first for day_pass, group_events, sana_concert (events filtered by event.date/dates from DB) */}
                        {showEventSelection && hasDateFilter && (
                            <div className="space-y-2 pt-4 border-t border-zinc-800">
                                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    {formData.passType === 'group_events' ? 'Date' : 'Day'}
                                </label>
                                <select
                                    value={selectedDay}
                                    onChange={(e) => setSelectedDay(e.target.value)}
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 appearance-none cursor-pointer"
                                >
                                    <option value="">Select {formData.passType === 'group_events' ? 'date' : 'day'}</option>
                                    {(formData.passType === 'day_pass' ? dayPassDates : groupEventsDates).map((d) => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                        )}

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
                                ) : formData.passType === 'sana_concert' ? (
                                    /* Sana Pass: grouped by date, no day selector */
                                    <div className="space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                                        {Object.keys(sanaGroupedByDate).length === 0 ? (
                                            <div className="border border-dashed border-zinc-800 rounded-xl p-4 text-center text-zinc-600 text-sm">
                                                No active events found for Sana Concert.
                                            </div>
                                        ) : (
                                            Object.entries(sanaGroupedByDate)
                                                .sort(([a], [b]) => a.localeCompare(b))
                                                .map(([date, dateEvents]) => (
                                                    <div key={date} className="space-y-2">
                                                        <div className="flex items-center gap-2 py-1 border-b border-zinc-700/50">
                                                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                                                {formatDateHeader(date)}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {dateEvents.map((evt) => {
                                                                const isSelected = selectedEventIds.includes(evt.id);
                                                                const isConflicting = conflictingEventIds.has(evt.id) && !isSelected;
                                                                const selectedEvtsForConflict = filteredEvents.filter((e) => selectedEventIds.includes(e.id));
                                                                const conflictWithNames = isConflicting && selectedEvtsForConflict.length > 0
                                                                    ? getConflictWarnings(
                                                                        toEventWithTiming(evt),
                                                                        selectedEvtsForConflict.map((e) => toEventWithTiming(e))
                                                                    )
                                                                    : [];

                                                                return (
                                                                    <button
                                                                        key={evt.id}
                                                                        type="button"
                                                                        disabled={isConflicting}
                                                                        onClick={() => toggleEventSelection(evt.id, isConflicting, conflictWithNames)}
                                                                        title={isConflicting && conflictWithNames.length > 0 ? `Time clash with ${conflictWithNames.join(', ')}` : undefined}
                                                                        className={`
                                                                            text-left p-3 rounded-xl border transition-all duration-200 flex flex-col gap-1
                                                                            ${isSelected ? 'border-blue-500/50 bg-blue-500/10' : isConflicting ? 'border-red-900/30 bg-red-950/10 opacity-50 cursor-not-allowed' : 'border-zinc-800 bg-black/40 hover:border-zinc-700 hover:bg-black/60'}
                                                                        `}
                                                                    >
                                                                        <div className="flex items-start justify-between w-full">
                                                                            <span className={`text-sm font-medium pr-2 truncate ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{evt.name}</span>
                                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                                {isConflicting && (
                                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium uppercase tracking-wider">Clash</span>
                                                                                )}
                                                                                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-zinc-700'}`}>
                                                                                    {isSelected && <div className="w-full h-full rounded-full bg-blue-500 border-[2px] border-black" />}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono flex-wrap">
                                                                            {evt.category && <span>{evt.category.toUpperCase()}</span>}
                                                                            {(evt.startTime || evt.endTime) && (
                                                                                <span className={isConflicting ? 'text-red-400' : ''}>
                                                                                    {evt.startTime}{evt.endTime ? ` – ${evt.endTime}` : ''}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                                        {filteredEvents.map((evt) => {
                                            const isSelected = selectedEventIds.includes(evt.id);
                                            const isConflicting = conflictingEventIds.has(evt.id) && !isSelected;
                                            const selectedEvtsForConflict = filteredEvents.filter((e) => selectedEventIds.includes(e.id));
                                            const conflictWithNames = isConflicting && selectedEvtsForConflict.length > 0
                                                ? getConflictWarnings(
                                                    toEventWithTiming(evt, effectiveDateForConflicts),
                                                    selectedEvtsForConflict.map((e) => toEventWithTiming(e, effectiveDateForConflicts))
                                                )
                                                : [];

                                            return (
                                                <button
                                                    key={evt.id}
                                                    type="button"
                                                    disabled={isConflicting}
                                                    onClick={() => toggleEventSelection(evt.id, isConflicting, conflictWithNames)}
                                                    title={isConflicting && conflictWithNames.length > 0 ? `Time clash with ${conflictWithNames.join(', ')}` : undefined}
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
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            {isConflicting && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium uppercase tracking-wider" title={conflictWithNames.length ? `Clash with ${conflictWithNames.join(', ')}` : undefined}>
                                                                    Clash
                                                                </span>
                                                            )}
                                                            <div className={`
                                                                w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors
                                                                ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-zinc-700'}
                                                            `}>
                                                                {isSelected && <div className="w-full h-full rounded-full bg-blue-500 border-[2px] border-black" />}
                                                            </div>
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
                                                {hasDateFilter && !selectedDay
                                                    ? 'Select a day above to see events.'
                                                    : 'No active events found for this pass type.'}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Group Events: Team section — limits and price from selected event(s) in DB */}
                        {showTeamSection && (
                            <div className="space-y-4 pt-4 border-t border-zinc-800">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Team</span>
                                    <span className="text-sm font-medium text-white">Amount: ₹{groupEventsAmount} ({totalMembers} × ₹{teamLimits.pricePerPerson})</span>
                                </div>
                                <p className="text-xs text-zinc-500">Team limit: {teamLimits.minMembers}–{teamLimits.maxMembers} members (from selected event(s))</p>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Team Name</label>
                                    <input
                                        required={showTeamSection}
                                        type="text"
                                        value={teamName}
                                        onChange={(e) => setTeamName(e.target.value)}
                                        placeholder="e.g. Team Phoenix"
                                        className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-zinc-700"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Members ({totalMembers})</label>
                                        <button
                                            type="button"
                                            onClick={addMember}
                                            disabled={totalMembers >= teamLimits.maxMembers}
                                            className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <IconPlus size={14} />
                                            Add member
                                        </button>
                                    </div>
                                    <div className="space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar pr-2">
                                        {members.map((member, index) => (
                                            <div key={index} className="bg-black/40 border border-zinc-800 rounded-xl p-3 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                                                        {member.isLeader ? 'Leader' : `Member ${index + 1}`}
                                                    </span>
                                                    {members.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeMember(index)}
                                                            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                            aria-label="Remove member"
                                                        >
                                                            <IconTrash size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <input
                                                        required={showTeamSection}
                                                        type="text"
                                                        placeholder="Name"
                                                        value={member.name}
                                                        onChange={(e) => updateMember(index, 'name', e.target.value)}
                                                        className="bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                    <input
                                                        required={showTeamSection}
                                                        type="tel"
                                                        placeholder="Phone"
                                                        value={member.phone}
                                                        onChange={(e) => updateMember(index, 'phone', e.target.value)}
                                                        className="bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                    <input
                                                        type="email"
                                                        placeholder="Email (optional)"
                                                        value={member.email}
                                                        onChange={(e) => updateMember(index, 'email', e.target.value)}
                                                        className="bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={
                                loading ||
                                (showEventSelection && selectedEventIds.length === 0) ||
                                (hasDateFilter && !selectedDay) ||
                                !canSubmitGroupEvents
                            }
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
