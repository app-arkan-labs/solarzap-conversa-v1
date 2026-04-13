# Google Ads Verification Video

This checklist is for recording the Google OAuth verification demo for SolarZap with the restricted Google Ads scope.

## Before recording

1. Use the same production domain, branding, privacy policy, and terms that are configured in the Google Cloud project under review.
2. Switch the Google consent screen language to English.
3. Prepare one demo organization with a valid Google Ads MCC, customer account, and conversion action.
4. Seed one demo lead with a Google click ID before recording.

### Seed the demo lead

Generate the org webhook key in Tracking & Conversoes, then run:

```powershell
./scripts/ops/seed_google_ads_demo_lead.ps1 \
  -SupabaseUrl "https://YOUR_PROJECT.supabase.co" \
  -OrgKey "YOUR_ORG_WEBHOOK_KEY"
```

## Required flow to show

1. Open SolarZap and navigate to Tracking & Conversoes.
2. Show the Google Ads card in the disconnected state.
3. Click Conectar Google Ads.
4. Show the English Google consent screen, including:
   - The SolarZap app name.
   - The browser address bar with the correct OAuth client ID.
   - The requested Google Ads scope.
5. Grant access and return to SolarZap.
6. Show the connected badge and connected account email.
7. Load and select the MCC account, the customer account, and the conversion action.
8. Save the selection and click Testar conexao.
9. In the Regras tab, map one CRM stage to a Google Ads conversion event.
10. Enable Google Ads.
11. Move the seeded lead to the mapped stage in the pipeline.
12. Return to the Monitoramento tab and show the Google Ads delivery row.

## What to say in the narration

Use clear English and describe only the implemented behavior:

- SolarZap asks for Google Ads access so each customer can connect their own Google Ads account.
- After consent, SolarZap reads accessible Google Ads accounts and available conversion actions.
- When a lead reaches a mapped CRM stage, SolarZap uploads an offline click conversion to Google Ads.
- SolarZap does not manage campaigns, keywords, budgets, or ads.

## Preflight check

Before the final take, confirm the full flow works end to end.

- OAuth connection succeeds.
- MCC, customer, and conversion action lists populate.
- The seeded lead contains gclid, gbraid, or wbraid.
- The Monitoramento tab shows a Google Ads delivery after the pipeline stage change.

If OAuth works but delivery fails, inspect the Vault secret read path in the deployed environment before recording again.