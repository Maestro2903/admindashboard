'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PassManagementRecord } from '@/types/admin';

const IST = 'Asia/Kolkata';

function formatDateExport(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const PASS_TYPE_TITLES: Record<string, string> = {
  day_pass: 'Day Pass Registrations',
  group_events: 'Group Events Registrations',
  proshow: 'Proshow Registrations',
  sana_concert: 'All Day Pass Registrations',
};

export function ExportButtons({
  records,
  passType,
  title,
}: {
  records: PassManagementRecord[];
  passType: string;
  title?: string;
}) {
  const displayTitle = title ?? PASS_TYPE_TITLES[passType] ?? `${passType} Registrations`;

  const downloadCsv = React.useCallback(() => {
    const hasFullTeam = passType === 'group_events' && records.some((r) => r.team?.members?.length);
    if (hasFullTeam) {
      const headers = [
        'Team Name',
        'Member Name',
        'Phone',
        'Email',
        'Checked In',
        'Check-in Time',
        'Leader',
      ];
      const rows: string[] = [];
      let totalParticipants = 0;
      for (const r of records) {
        const team = r.team;
        if (!team?.members?.length) continue;
        for (const m of team.members) {
          totalParticipants += 1;
          rows.push(
            [
              team.teamName,
              m.name,
              m.phone,
              m.email ?? '',
              m.checkedIn ? 'Yes' : 'No',
              m.checkInTime ? formatDateExport(m.checkInTime) : '-',
              m.isLeader ? 'Yes' : 'No',
            ].map(escapeCsv).join(',')
          );
        }
      }
      const totalTeams = records.filter((r) => r.team != null).length;
      const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
      const summary = [
        '',
        `Total teams,${totalTeams}`,
        `Total participants,${totalParticipants}`,
        `Total revenue (₹),${totalRevenue}`,
      ].join('\r\n');
      const csv = [headers.join(','), ...rows, '', summary].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `group-events-members-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }

    const isGroup = records.some((r) => r.teamName != null);
    const headers = [
      'Pass ID',
      'User Name',
      ...(isGroup ? ['Team Name', 'Total Members', 'Checked-In Count'] : []),
      'College',
      'Phone',
      'Amount',
      'Payment Status',
      'Pass Status',
      'Created At',
      'Used At',
      'Scanned By',
    ];
    const rows = records.map((r) =>
      [
        r.passId,
        r.userName,
        ...(isGroup ? [r.teamName ?? '', r.totalMembers ?? '', r.checkedInCount ?? ''] : []),
        r.college,
        r.phone,
        r.amount,
        r.paymentStatus,
        r.passStatus,
        formatDateExport(r.createdAt),
        formatDateExport(r.usedAt),
        r.scannedBy ?? '',
      ].map(escapeCsv).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `passes-${passType}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [records, passType]);

  const downloadPdf = React.useCallback(async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('l', 'mm', 'a4'); // landscape for wide table
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const totalRevenue = records.reduce((s, r) => s + r.amount, 0);

    // Dark header
    pdf.setFillColor(24, 24, 27); // zinc-900
    pdf.rect(0, 0, pageWidth, 22);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(displayTitle, 14, 14);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Exported: ${formatDateExport(new Date().toISOString())}`, pageWidth - 14, 14, {
      align: 'right',
    });

    const hasFullTeam = passType === 'group_events' && records.some((r) => r.team?.members?.length);
    if (hasFullTeam) {
      const totalTeams = records.filter((r) => r.team != null).length;
      let totalParticipants = 0;
      for (const r of records) {
        if (r.team?.members?.length) totalParticipants += r.team.members.length;
      }
      pdf.setFontSize(8);
      pdf.setTextColor(80, 80, 80);
      pdf.text(
        `Total teams: ${totalTeams} | Total participants: ${totalParticipants} | Revenue: ₹${totalRevenue.toLocaleString()}`,
        14,
        28
      );
      const headers = ['Team Name', 'Member Name', 'Phone', 'Checked In', 'Check-in Time', 'Leader'];
      const numCols = headers.length;
      const colW = (pageWidth - 28) / numCols;
      let y = 34;
      const rowH = 5;
      const fontSize = 6;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(0, 0, 0);
      headers.forEach((h, i) => {
        pdf.text(h, 14 + i * colW, y);
      });
      y += rowH;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, y - 2, pageWidth - 14, y - 2);
      pdf.setFont('helvetica', 'normal');

      for (const r of records) {
        const team = r.team;
        if (!team?.members?.length) continue;
        for (const m of team.members) {
          if (y > pageHeight - 18) {
            pdf.addPage();
            pdf.setFillColor(24, 24, 27);
            pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 22);
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(9);
            pdf.text(displayTitle, 14, 14);
            y = 28;
            pdf.setTextColor(0, 0, 0);
          }
          const cells = [
            team.teamName.slice(0, 14),
            m.name.slice(0, 14),
            m.phone.slice(0, 12),
            m.checkedIn ? 'Yes' : 'No',
            m.checkInTime ? formatDateExport(m.checkInTime).slice(0, 12) : '-',
            m.isLeader ? 'Yes' : 'No',
          ];
          cells.forEach((cell, i) => {
            pdf.text(String(cell), 14 + i * colW, y);
          });
          y += rowH;
        }
      }
      pdf.save(`group-events-members-${new Date().toISOString().slice(0, 10)}.pdf`);
      return;
    }

    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    pdf.text(
      `Total: ${records.length} | Revenue: ₹${totalRevenue.toLocaleString()} | ${formatDateExport(new Date().toISOString())}`,
      14,
      28
    );

    const isGroup = records[0]?.teamName != null;
    const headers = [
      'Pass ID',
      'Name',
      ...(isGroup ? ['Team', 'Members', 'Checked-In'] : []),
      'College',
      'Phone',
      'Amount',
      'Status',
      'Created',
      'Used',
      'Scanned By',
    ];
    const numCols = headers.length;
    const colW = (pageWidth - 28) / numCols;
    let y = 34;
    const rowH = 6;
    const fontSize = 6;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontSize);
    pdf.setTextColor(0, 0, 0);
    headers.forEach((h, i) => {
      pdf.text(h, 14 + i * colW, y);
    });
    y += rowH;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, y - 2, pageWidth - 14, y - 2);
    pdf.setFont('helvetica', 'normal');

    for (const r of records) {
      if (y > pageHeight - 20) {
        pdf.addPage();
        pdf.setFillColor(24, 24, 27);
        pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 22);
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.text(displayTitle, 14, 14);
        y = 28;
        pdf.setTextColor(0, 0, 0);
      }
      const cells = [
        r.passId.slice(0, 8),
        r.userName.slice(0, 14),
        ...(isGroup
          ? [(r.teamName ?? '').slice(0, 10), String(r.totalMembers ?? ''), String(r.checkedInCount ?? '')]
          : []),
        r.college.slice(0, 14),
        r.phone.slice(0, 10),
        `₹${r.amount}`,
        r.passStatus,
        formatDateExport(r.createdAt).slice(0, 12),
        r.usedAt ? formatDateExport(r.usedAt).slice(0, 12) : '—',
        (r.scannedBy ?? '').slice(0, 10),
      ];
      cells.forEach((cell, i) => {
        pdf.text(String(cell), 14 + i * colW, y);
      });
      y += rowH;
    }

    pdf.save(`passes-${passType}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [records, passType, displayTitle]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-white"
        >
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-zinc-700 bg-zinc-800">
        <DropdownMenuItem
          onClick={downloadCsv}
          disabled={records.length === 0}
          className="text-zinc-100 focus:bg-zinc-700 focus:text-white"
        >
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={downloadPdf}
          disabled={records.length === 0}
          className="text-zinc-100 focus:bg-zinc-700 focus:text-white"
        >
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
