import React from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import ClientIdentityCard from './ClientIdentityCard';

interface ClientProfileLayoutProps {
  client: ClientWithIdentity;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export default function ClientProfileLayout({ client, onEdit, onDelete, children }: ClientProfileLayoutProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left sidebar - Identity Card */}
      <div className="w-full lg:w-[30%] lg:min-w-[280px] lg:max-w-[340px] shrink-0">
        <div className="lg:sticky lg:top-4">
          <ClientIdentityCard
            client={client}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* Right content - Tabs */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
