import React from 'react';
import ReportGenerator from '../shared/ReportGenerator';

export default function HrReportsTab() {
  return (
    <div className="space-y-4">
      <ReportGenerator filter={['registre-personnel', 'bilan-social']} />
    </div>
  );
}
