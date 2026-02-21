import { useState, useEffect, useMemo } from "react";
import { X, Users } from "lucide-react";
import type { StepComponentProps, MemberEntry } from "../types";
import { clientApi } from "../../../../lib/api-client";
import { formatClientName, resolveStorageUrl } from "../../../../lib/format";
import SearchableSelect from "../../../ui/SearchableSelect";
import { GROUP_ROLE_OPTIONS } from "../../TontinePlanWizard/constants";

export default function StepMembers({ formData, updateField }: StepComponentProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientApi.getAllList()
      .then((data) => setClients(data || []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, []);

  const memberIds = useMemo(() => formData.members.map((m) => m.clientId), [formData.members]);
  const maxMembers = parseInt(formData.nombreMembres) || 10;

  const addMember = (clientId: string) => {
    if (memberIds.includes(clientId)) return;
    const updated: MemberEntry[] = [...formData.members, { clientId, groupRole: "" }];
    updateField("members", updated);
    // Also add to payout order
    updateField("payoutOrder", [...formData.payoutOrder, clientId]);
  };

  const removeMember = (clientId: string) => {
    updateField("members", formData.members.filter((m) => m.clientId !== clientId));
    updateField("payoutOrder", formData.payoutOrder.filter((id) => id !== clientId));
  };

  const updateRole = (clientId: string, role: string) => {
    updateField(
      "members",
      formData.members.map((m) => m.clientId === clientId ? { ...m, groupRole: role } : m)
    );
  };

  const memberClients = useMemo(() => {
    return formData.members.map((m) => ({
      ...m,
      client: clients.find((c) => c.id === m.clientId),
    }));
  }, [formData.members, clients]);

  if (loading) {
    return <div className="text-sm text-content-muted py-8 text-center">Chargement des clients...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Member Search */}
      <div className="relative z-20">
        <SearchableSelect
          label=""
          name="member_search"
          placeholder="Rechercher un membre a ajouter..."
          options={clients
            .filter((c) => !memberIds.includes(c.id))
            .map((c) => ({
              value: c.id,
              label: formatClientName(c.nom, c.prenom),
              subLabel: `${c.telephone || ""} · ${c.quartier || ""}`.trim(),
              image: c.photoProfile,
            }))}
          value=""
          onChange={(val) => addMember(val as string)}
          variant="dark"
          className="w-full"
        />
      </div>

      {/* Members List */}
      <div>
        <label className="text-xs font-semibold text-content-muted uppercase mb-2 block">
          Participants ({formData.members.length} / {maxMembers})
        </label>

        <div className="space-y-2">
          {memberClients.map(({ clientId, groupRole, client }) => {
            const photoUrl = client ? resolveStorageUrl(client.photoProfile) : null;
            return (
              <div key={clientId} className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{client?.prenom?.charAt(0) || client?.nom?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-content-primary truncate">
                    {client ? formatClientName(client.nom, client.prenom) : clientId}
                  </div>
                  <div className="text-[10px] text-content-muted">{client?.telephone}</div>
                </div>
                {formData.rolesEnabled && (
                  <select
                    value={groupRole}
                    onChange={(e) => updateRole(clientId, e.target.value)}
                    className="px-2 py-1 text-[10px] bg-input border border-input-border rounded text-content-secondary focus:border-input-focus focus:outline-none"
                  >
                    <option value="">Membre</option>
                    {GROUP_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => removeMember(clientId)}
                  className="text-content-muted hover:text-status-danger transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, maxMembers - formData.members.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center gap-3 p-3 border border-dashed border-edge-subtle rounded-lg opacity-50">
              <div className="w-8 h-8 rounded-full bg-surface-subtle flex items-center justify-center text-content-muted shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-content-muted">Place libre {formData.members.length + i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
