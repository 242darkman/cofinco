import { saveCSVToLoge, saveExcelToLoge, savePDFToLoge, saveJSONToLoge, type SaveToLogeOptions } from './loge-storage';

export interface ExportOptions {
  saveToLoge?: boolean;
  logeCategorie?: SaveToLogeOptions['categorie'];
  logeReferenceType?: string;
  logeReferenceId?: string;
  logeTags?: string[];
}

export const exportToCSV = async (data: any[], filename: string, options?: ExportOptions) => {
  if (!data || data.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');

  if (options?.saveToLoge) {
    await saveCSVToLoge(csvContent, {
      nom: filename,
      categorie: options.logeCategorie || 'rapports',
      referenceType: options.logeReferenceType,
      referenceId: options.logeReferenceId,
      tags: options.logeTags
    });
  }
};

export const exportToExcel = async (data: any[], filename: string, options?: ExportOptions) => {
  if (!data || data.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }

  const headers = Object.keys(data[0]);

  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">';
  html += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
  html += '<x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>';
  html += '</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>';
  html += '<table border="1">';

  html += '<thead><tr>';
  headers.forEach(header => {
    html += `<th style="background-color: #4B5563; color: white; padding: 8px; font-weight: bold;">${header}</th>`;
  });
  html += '</tr></thead>';

  html += '<tbody>';
  data.forEach((row, index) => {
    html += `<tr style="background-color: ${index % 2 === 0 ? '#F9FAFB' : '#FFFFFF'};">`;
    headers.forEach(header => {
      const value = row[header] ?? '';
      html += `<td style="padding: 6px;">${value}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></body></html>';

  downloadFile(html, `${filename}.xls`, 'application/vnd.ms-excel;charset=utf-8;');

  if (options?.saveToLoge) {
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    await saveExcelToLoge(blob, {
      nom: filename,
      categorie: options.logeCategorie || 'rapports',
      referenceType: options.logeReferenceType,
      referenceId: options.logeReferenceId,
      tags: options.logeTags
    });
  }
};

export const exportToPDF = async (data: any[], filename: string, title: string, options?: ExportOptions) => {
  if (!data || data.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }

  const headers = Object.keys(data[0]);

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        h1 {
          color: #1F2937;
          border-bottom: 3px solid #3B82F6;
          padding-bottom: 10px;
        }
        .metadata {
          color: #6B7280;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th {
          background-color: #3B82F6;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: bold;
        }
        td {
          padding: 10px;
          border-bottom: 1px solid #E5E7EB;
        }
        tr:nth-child(even) {
          background-color: #F9FAFB;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          color: #6B7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="metadata">
        <strong>Date d'export:</strong> ${new Date().toLocaleString('fr-FR')}<br>
        <strong>Nombre d'enregistrements:</strong> ${data.length}
      </div>
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map((row, index) => `
            <tr>
              ${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="footer">
        Généré par COFIN Platform - République du Congo<br>
        Document confidentiel - Ne pas diffuser
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  if (options?.saveToLoge) {
    const blob = new Blob([html], { type: 'text/html' });
    await savePDFToLoge(blob, {
      nom: filename,
      description: title,
      categorie: options.logeCategorie || 'rapports',
      referenceType: options.logeReferenceType,
      referenceId: options.logeReferenceId,
      tags: options.logeTags
    });
  }
};

export const exportToJSON = async (data: any[], filename: string, options?: ExportOptions) => {
  if (!data || data.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, `${filename}.json`, 'application/json;charset=utf-8;');

  if (options?.saveToLoge) {
    await saveJSONToLoge(data, {
      nom: filename,
      categorie: options.logeCategorie || 'rapports',
      referenceType: options.logeReferenceType,
      referenceId: options.logeReferenceId,
      tags: options.logeTags
    });
  }
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export const generateAuditReport = (logs: any[], title: string) => {
  const summary = {
    total: logs.length,
    byAction: logs.reduce((acc: any, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {}),
    byStatus: logs.reduce((acc: any, log) => {
      acc[log.status] = (acc[log.status] || 0) + 1;
      return acc;
    }, {}),
    uniqueUsers: new Set(logs.map(l => l.user_email)).size,
    timeRange: {
      start: logs[logs.length - 1]?.timestamp,
      end: logs[0]?.timestamp
    }
  };

  return {
    title,
    generatedAt: new Date().toISOString(),
    summary,
    logs
  };
};
