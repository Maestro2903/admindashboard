'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { IconCreditCard, IconUserPlus } from '@tabler/icons-react';
import { toast } from 'sonner';
// @ts-expect-error No type definitions available for the Cashfree JS SDK
import { load } from '@cashfreepayments/cashfree-js';

let cashfree: any;
const initializeCashfree = async () => {
    cashfree = await load({
        mode: process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
    });
};

initializeCashfree();

const PASS_TYPES = [
    { value: 'day_pass', label: 'Day Pass (₹500)' },
    { value: 'proshow', label: 'Proshow (₹1500)' },
    { value: 'group_events', label: 'Group Events (₹500)' },
    { value: 'sana_concert', label: 'SaNa Concert (₹2000)' },
];

export default function RegistrationsPage() {
    const { user, userData, loading: authLoading } = useAuth();

    const [formData, setFormData] = React.useState({
        name: '',
        email: '',
        phone: '',
        college: '',
        passType: '',
    });

    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const hasAccess = !authLoading && userData?.adminRole && ['manager', 'superadmin'].includes(userData.adminRole);

    React.useEffect(() => {
        // Detect return redirect from Cashfree
        const urlParams = new URLSearchParams(window.location.search);
        const completedOrderId = urlParams.get('order_id');
        if (completedOrderId) {
            toast.success(`Payment successful for Order ID: ${completedOrderId}. You can find the record in Operations!`);
            // Clean up the URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        try {
            setIsSubmitting(true);
            const token = await user.getIdToken(false);

            const res = await fetch('/api/admin/create-registration-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create order');

            if (data.paymentSessionId) {
                toast.success('Order created! Initiating checkout...');

                const checkoutOptions = {
                    paymentSessionId: data.paymentSessionId,
                    redirectTarget: '_self'
                };

                cashfree.checkout(checkoutOptions);
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authLoading) return <div className="p-8 text-white">Loading...</div>;

    if (!hasAccess) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
                <h2 className="text-xl font-bold text-white">Access Denied</h2>
                <p className="text-zinc-400">You do not have permission to manually register attendees.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-8">
            <div className="mb-8 border-b border-zinc-800 pb-4">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <IconUserPlus className="text-emerald-500" />
                    Manual Registration
                </h1>
                <p className="text-zinc-400 text-sm mt-1">Register a new attendee and generate a Cashfree checkout session natively.</p>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-6 bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
                <div className="space-y-4">
                    <div>
                        <Label className="text-zinc-300">Full Name</Label>
                        <Input
                            required
                            value={formData.name}
                            onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                            placeholder="Attendee Name"
                            className="mt-1 bg-zinc-950 border-zinc-800 text-white"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-zinc-300">Email Address</Label>
                            <Input
                                required
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
                                placeholder="name@example.com"
                                className="mt-1 bg-zinc-950 border-zinc-800 text-white"
                            />
                        </div>
                        <div>
                            <Label className="text-zinc-300">Phone Number</Label>
                            <Input
                                required
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))}
                                placeholder="+91"
                                className="mt-1 bg-zinc-950 border-zinc-800 text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="text-zinc-300">College / Institution</Label>
                        <Input
                            required
                            value={formData.college}
                            onChange={(e) => setFormData(f => ({ ...f, college: e.target.value }))}
                            placeholder="University Name"
                            className="mt-1 bg-zinc-950 border-zinc-800 text-white"
                        />
                    </div>

                    <div>
                        <Label className="text-zinc-300">Select Pass</Label>
                        <Select required value={formData.passType} onValueChange={(v) => setFormData(f => ({ ...f, passType: v }))}>
                            <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
                                <SelectValue placeholder="Choose a pass to purchase" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                                {PASS_TYPES.map(p => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                    <Button
                        type="submit"
                        disabled={isSubmitting || !formData.passType}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        <IconCreditCard size={18} className="mr-2" />
                        {isSubmitting ? 'Generating Checkout...' : 'Book & Pay'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
