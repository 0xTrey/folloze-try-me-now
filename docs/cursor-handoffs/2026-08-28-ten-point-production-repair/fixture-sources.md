# Aprio regression fixture sources

Snapshot date: 2026-08-28.

These official pages define test evidence for the Aprio regression fixture. Store only compact, public, sanitized fixture facts in tests. Production behavior must continue to use runtime evidence and must not contain Aprio-specific branches.

| Official source | Supported fixture facts |
|---|---|
| `https://www.aprio.com/about/` | Aprio is a business advisory, tax, and accounting firm. |
| `https://www.aprio.com/advisory-services/` | Advisory Services includes strategic and financial, people and talent, technology and digital transformation, and risk and compliance focus areas. |
| `https://www.aprio.com/client-accounting-services/` | Client Accounting and Advisory Services includes CFO advisory, outsourced accounting, HR/payroll outsourcing, and industry-specific accounting services. |
| `https://www.aprio.com/cfo-advisory-services/` | CFO Advisory Services serves growing companies, owner-led businesses, and companies navigating growth or transition. |
| `https://www.aprio.com/services/business-applications-advisory-services/` | Business Applications and ERP Advisory Services includes ERP assessment, system selection, and system solutioning. |

Expected fixture behavior:

- The offer recommender can extract at least two distinct service or solution choices from the supplied evidence set.
- An accounting or CFO advisory selection recommends finance and business decision makers, not generic AI or platform leaders.
- A technology/ERP advisory selection may recommend finance systems, ERP, or transformation buyers only when the selected evidence supports those roles.
- A sparse version of the fixture removes the detail pages and must fall back to free form plus URL rather than inventing choices.
