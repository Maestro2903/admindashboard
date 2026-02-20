import { jsPDF } from 'jspdf';
import { convertSvgToBase64Png } from '@/lib/utils/svgConverter';

interface PassPDFData {
  passType: string;
  amount: number;
  userName: string;
  email: string;
  phone: string;
  college: string;
  qrCode: string;
  logoDataUrl?: string;
  teamName?: string;
  members?: Array<{ name: string; isLeader?: boolean }>;
}

function drawPageLayout(pdf: jsPDF, pageWidth: number, pageHeight: number) {
  pdf.setDrawColor(26, 26, 26);
  pdf.setLineWidth(1);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);

  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(25, 275, pageWidth - 25, 275);

  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text('Innovation Meets Culture', pageWidth / 2, 282, { align: 'center' });
  pdf.setFontSize(8);
  pdf.text('Chennai Institute of Technology', pageWidth / 2, 288, { align: 'center' });
}

export async function generatePassPDFBuffer(data: PassPDFData): Promise<Buffer> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  drawPageLayout(pdf, pageWidth, pageHeight);

  let logoDataUrl = data.logoDataUrl;
  if (!logoDataUrl) {
    logoDataUrl = await convertSvgToBase64Png('/tk-logo.svg');
  }

  const logoSize = 35;
  pdf.addImage(
    logoDataUrl,
    'PNG',
    (pageWidth - logoSize) / 2,
    20,
    logoSize,
    logoSize
  );

  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('CIT TAKSHASHILA 2026', pageWidth / 2, 65, { align: 'center' });

  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'normal');
  pdf.text('EVENT PASS', pageWidth / 2, 73, { align: 'center' });

  pdf.setDrawColor(100, 100, 100);
  pdf.setLineWidth(0.5);
  pdf.line(40, 78, pageWidth - 40, 78);

  const qrSize = 70;
  pdf.addImage(data.qrCode, 'PNG', (pageWidth - qrSize) / 2, 85, qrSize, qrSize);

  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text('Show this QR at entry', pageWidth / 2, 162, { align: 'center' });

  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(25, 170, pageWidth - 25, 170);

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('PASS DETAILS', pageWidth / 2, 180, { align: 'center' });

  const startY = 190;
  const lineHeight = 10;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');

  pdf.setFont('helvetica', 'bold');
  pdf.text('Pass Type:', 30, startY);
  pdf.text('Amount:', 30, startY + lineHeight);
  pdf.text('Name:', 30, startY + lineHeight * 2);
  pdf.text('Email:', 30, startY + lineHeight * 3);
  pdf.text('Phone:', 30, startY + lineHeight * 4);
  pdf.text('College:', 30, startY + lineHeight * 5);

  pdf.setFont('helvetica', 'normal');
  pdf.text(data.passType, 70, startY);
  pdf.text(`₹${data.amount}`, 70, startY + lineHeight);
  pdf.text(data.userName, 70, startY + lineHeight * 2);
  pdf.text(data.email || 'N/A', 70, startY + lineHeight * 3);
  pdf.text(data.phone, 70, startY + lineHeight * 4);
  pdf.text(data.college, 70, startY + lineHeight * 5);

  if (data.teamName || (data.members && data.members.length > 0)) {
    let currentY = startY + lineHeight * 6 + 5;

    pdf.setDrawColor(200, 200, 200);
    pdf.line(25, currentY - 5, pageWidth - 25, currentY - 5);

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('TEAM DETAILS', pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    pdf.setFontSize(10);
    if (data.teamName) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Team Name:', 30, currentY);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.teamName, 70, currentY);
      currentY += 7;
    }

    if (data.members && data.members.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Members:', 30, currentY);
      pdf.setFont('helvetica', 'normal');

      const members = data.members;
      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const text = `${i + 1}. ${member.name}${member.isLeader ? ' (Leader)' : ''}`;

        if (currentY > 265) {
          pdf.addPage();
          drawPageLayout(pdf, pageWidth, pageHeight);
          currentY = 30;
        }

        pdf.text(text, 70, currentY);
        currentY += 6;
      }
    }
  }

  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
  return pdfBuffer;
}
