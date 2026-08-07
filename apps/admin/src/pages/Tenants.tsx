import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Tenant } from "../api";

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTenants()
      .then((r) => setTenants(r.tenants))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
          <th>Business</th>
          <th>Vertical</th>
          <th>Plan</th>
          <th>Status</th>
          <th>Subdomain</th>
        </tr>
      </thead>
      <tbody>
        {tenants.map((t) => (
          <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
            <td>
              <Link to={`/tenants/${t.id}`}>{t.business_name}</Link>
            </td>
            <td>{t.vertical}</td>
            <td>{t.plan}</td>
            <td>{t.status}</td>
            <td>{t.custom_domain ?? t.subdomain}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
