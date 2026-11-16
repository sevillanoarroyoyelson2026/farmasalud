import type { DailySales, ProductSales } from '../../../shared/models/business-indicators';

export interface OrderCountGroup {
  groupName: string;
  orderCount: number;
}

export interface ExpiringLotForReport {
  productName: string;
  lotNumber: string;
  branchName: string;
  expirationDate: Date | null;
  quantityAvailable: number;
}

/** Todo lo que necesita el PDF; la página de reportes ya lo tiene calculado. */
export interface SalesReportData {
  branchName: string;
  periodDays: number;
  generatedAt: Date;
  periodSalesTotal: number;
  nonCancelledOrdersCount: number;
  averageTicket: number;
  dailySales: DailySales[];
  bestSellingProducts: ProductSales[];
  ordersByStatus: OrderCountGroup[];
  ordersByPaymentMethod: OrderCountGroup[];
  ordersByFulfillment: OrderCountGroup[];
  /** null = el usuario no consultó los vencimientos antes de exportar. */
  expiringLots: ExpiringLotForReport[] | null;
}

const PAGE_MARGIN_MM = 14;
const BRAND_COLOR_RGB: [number, number, number] = [15, 118, 110];
const TEXT_COLOR_RGB: [number, number, number] = [15, 23, 42];
const MUTED_COLOR_RGB: [number, number, number] = [100, 116, 139];

const solesFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const formatSoles = (amount: number) => solesFormatter.format(amount).replace(/ /g, ' ');
const formatDate = (date: Date) =>
  date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: '2-digit' });

/**
 * Genera y descarga el reporte de gestión en PDF (A4).
 * jsPDF se carga recién al exportar: no pesa en la carga inicial del panel.
 */
export async function downloadSalesReportPdf(reportData: SalesReportData): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdfDocument = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdfDocument.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;

  const tableTheme = {
    margin: { left: PAGE_MARGIN_MM, right: PAGE_MARGIN_MM },
    styles: { font: 'helvetica', fontSize: 9, textColor: TEXT_COLOR_RGB, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND_COLOR_RGB, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [246, 250, 249] as [number, number, number] },
  };
  /** Columnas numéricas: el encabezado se alinea a la derecha igual que sus cifras. */
  const rightAlignedColumns = (columnIndexes: number[]) => ({
    columnStyles: Object.fromEntries(columnIndexes.map((columnIndex) => [columnIndex, { halign: 'right' as const }])),
    didParseCell: (cellHook: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (cellHook.section === 'head' && columnIndexes.includes(cellHook.column.index)) {
        cellHook.cell.styles.halign = 'right';
      }
    },
  });
  /** Posición vertical donde terminó la última tabla dibujada. */
  const getLastTableEnd = () => (pdfDocument as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const drawSectionTitle = (sectionTitle: string, positionY: number): number => {
    if (positionY > 255) {
      pdfDocument.addPage();
      positionY = PAGE_MARGIN_MM + 4;
    }
    pdfDocument.setFont('helvetica', 'bold');
    pdfDocument.setFontSize(12);
    pdfDocument.setTextColor(...TEXT_COLOR_RGB);
    pdfDocument.text(sectionTitle, PAGE_MARGIN_MM, positionY);
    return positionY + 3;
  };

  // ---------------------------------------------------------------- encabezado
  pdfDocument.setFillColor(...BRAND_COLOR_RGB);
  pdfDocument.rect(0, 0, pageWidth, 28, 'F');
  pdfDocument.setTextColor(255, 255, 255);
  pdfDocument.setFont('helvetica', 'bold');
  pdfDocument.setFontSize(18);
  pdfDocument.text('Farmasalud', PAGE_MARGIN_MM, 13);
  pdfDocument.setFontSize(11);
  pdfDocument.setFont('helvetica', 'normal');
  pdfDocument.text('Reporte de ventas y gestión', PAGE_MARGIN_MM, 21);
  pdfDocument.setFontSize(9);
  pdfDocument.text(
    [`${reportData.branchName}`, `Últimos ${reportData.periodDays} días · generado el ${formatDate(reportData.generatedAt)}`],
    pageWidth - PAGE_MARGIN_MM,
    13,
    { align: 'right' },
  );

  // ---------------------------------------------------------------- resumen
  const summaryCards: [string, string][] = [
    ['Ventas del período', formatSoles(reportData.periodSalesTotal)],
    ['Pedidos (sin cancelados)', String(reportData.nonCancelledOrdersCount)],
    ['Ticket promedio', formatSoles(reportData.averageTicket)],
  ];
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  summaryCards.forEach(([cardLabel, cardValue], cardIndex) => {
    const cardLeft = PAGE_MARGIN_MM + cardIndex * (cardWidth + cardGap);
    pdfDocument.setDrawColor(226, 232, 240);
    pdfDocument.setFillColor(255, 255, 255);
    pdfDocument.roundedRect(cardLeft, 34, cardWidth, 20, 2, 2, 'FD');
    pdfDocument.setFont('helvetica', 'normal');
    pdfDocument.setFontSize(8.5);
    pdfDocument.setTextColor(...MUTED_COLOR_RGB);
    pdfDocument.text(cardLabel, cardLeft + 4, 41);
    pdfDocument.setFont('helvetica', 'bold');
    pdfDocument.setFontSize(14);
    pdfDocument.setTextColor(...TEXT_COLOR_RGB);
    pdfDocument.text(cardValue, cardLeft + 4, 50);
  });

  // ---------------------------------------------------------------- gráfico de ventas por día
  let cursorY = drawSectionTitle('Ventas por día (S/)', 64);
  const chartTop = cursorY + 2;
  const chartHeight = 40;
  const chartBottom = chartTop + chartHeight;
  const maximumDailySales = Math.max(...reportData.dailySales.map((daySales) => daySales.salesTotal), 1);
  const barSlotWidth = contentWidth / Math.max(reportData.dailySales.length, 1);
  const barWidth = Math.max(barSlotWidth - 0.8, 0.6);
  pdfDocument.setDrawColor(203, 213, 225);
  pdfDocument.setLineWidth(0.2);
  pdfDocument.line(PAGE_MARGIN_MM, chartBottom, PAGE_MARGIN_MM + contentWidth, chartBottom);
  pdfDocument.setFillColor(...BRAND_COLOR_RGB);
  reportData.dailySales.forEach((daySales, dayIndex) => {
    if (daySales.salesTotal <= 0) {
      return;
    }
    const barHeight = Math.max((daySales.salesTotal / maximumDailySales) * chartHeight, 0.8);
    pdfDocument.rect(PAGE_MARGIN_MM + dayIndex * barSlotWidth, chartBottom - barHeight, barWidth, barHeight, 'F');
  });
  pdfDocument.setFont('helvetica', 'normal');
  pdfDocument.setFontSize(7.5);
  pdfDocument.setTextColor(...MUTED_COLOR_RGB);
  pdfDocument.text(`Máx. ${formatSoles(maximumDailySales)}`, PAGE_MARGIN_MM, chartTop - 1);
  const firstDay = reportData.dailySales[0]?.date;
  if (firstDay) {
    pdfDocument.text(formatDate(firstDay), PAGE_MARGIN_MM, chartBottom + 4);
  }
  pdfDocument.text('Hoy', PAGE_MARGIN_MM + contentWidth, chartBottom + 4, { align: 'right' });

  // Tabla con los días que tuvieron ventas (el gráfico no basta para leer cifras exactas).
  const daysWithSales = reportData.dailySales.filter((daySales) => daySales.orderCount > 0);
  autoTable(pdfDocument, {
    ...tableTheme,
    startY: chartBottom + 8,
    head: [['Día', 'Pedidos', 'Ventas']],
    body: daysWithSales.length
      ? daysWithSales.map((daySales) => [formatDayLabel(daySales.date), String(daySales.orderCount), formatSoles(daySales.salesTotal)])
      : [['Sin ventas en el período', '', '']],
    ...rightAlignedColumns([1, 2]),
  });

  // ---------------------------------------------------------------- productos más vendidos
  cursorY = drawSectionTitle('Productos más vendidos', getLastTableEnd() + 10);
  autoTable(pdfDocument, {
    ...tableTheme,
    startY: cursorY + 1,
    head: [['#', 'Producto', 'Unidades', 'Ingresos']],
    body: reportData.bestSellingProducts.length
      ? reportData.bestSellingProducts.map((productSales, rankIndex) => [
          String(rankIndex + 1),
          productSales.productName,
          String(productSales.unitsSold),
          formatSoles(productSales.revenue),
        ])
      : [['', 'Sin ventas en el período', '', '']],
    ...rightAlignedColumns([2, 3]),
  });

  // ---------------------------------------------------------------- distribución de pedidos
  cursorY = drawSectionTitle('Pedidos del período', getLastTableEnd() + 10);
  const distributionRows = [
    ...reportData.ordersByStatus.map((group) => ['Estado', group.groupName, String(group.orderCount)]),
    ...reportData.ordersByPaymentMethod.map((group) => ['Medio de pago', group.groupName, String(group.orderCount)]),
    ...reportData.ordersByFulfillment.map((group) => ['Tipo de entrega', group.groupName, String(group.orderCount)]),
  ];
  autoTable(pdfDocument, {
    ...tableTheme,
    startY: cursorY + 1,
    head: [['Criterio', 'Detalle', 'Pedidos']],
    body: distributionRows.length ? distributionRows : [['', 'Sin pedidos en el período', '']],
    ...rightAlignedColumns([2]),
  });

  // ---------------------------------------------------------------- vencimientos
  cursorY = drawSectionTitle('Lotes por vencer (próximos 90 días)', getLastTableEnd() + 10);
  if (reportData.expiringLots === null) {
    pdfDocument.setFont('helvetica', 'italic');
    pdfDocument.setFontSize(9);
    pdfDocument.setTextColor(...MUTED_COLOR_RGB);
    pdfDocument.text('No incluido: pulse "Consultar" en la sección de vencimientos antes de exportar.', PAGE_MARGIN_MM, cursorY + 4);
  } else {
    autoTable(pdfDocument, {
      ...tableTheme,
      startY: cursorY + 1,
      head: [['Producto', 'Lote', 'Botica', 'Vence', 'Unidades']],
      body: reportData.expiringLots.length
        ? reportData.expiringLots.map((expiringLot) => [
            expiringLot.productName,
            expiringLot.lotNumber,
            expiringLot.branchName,
            expiringLot.expirationDate ? formatDate(expiringLot.expirationDate) : '—',
            String(expiringLot.quantityAvailable),
          ])
        : [['Ningún lote vence en los próximos 90 días', '', '', '', '']],
      ...rightAlignedColumns([4]),
    });
  }

  // ---------------------------------------------------------------- pie de página
  const totalPages = pdfDocument.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    pdfDocument.setPage(pageNumber);
    pdfDocument.setFont('helvetica', 'normal');
    pdfDocument.setFontSize(8);
    pdfDocument.setTextColor(...MUTED_COLOR_RGB);
    const pageHeight = pdfDocument.internal.pageSize.getHeight();
    pdfDocument.text('Farmasalud E.I.R.L. · Trujillo · Documento de uso interno', PAGE_MARGIN_MM, pageHeight - 8);
    pdfDocument.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - PAGE_MARGIN_MM, pageHeight - 8, { align: 'right' });
  }

  const fileDate = reportData.generatedAt.toISOString().slice(0, 10);
  pdfDocument.save(`reporte-farmasalud-${reportData.periodDays}-dias-${fileDate}.pdf`);
}
