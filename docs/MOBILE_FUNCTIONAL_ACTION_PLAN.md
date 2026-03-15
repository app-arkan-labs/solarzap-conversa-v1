# Mobile Functional Action Plan

## Objective

Turn the current mobile experience into a stable, functional version across all main tabs without reintroducing desktop regressions.

## Current Diagnosis

The mobile implementation already introduced the right navigation model, but the app still has systemic issues in responsive behavior:

1. Shared content shells are inconsistent across tabs.
2. Some components still rely on fixed widths that are too rigid for small phones.
3. A few tabs are functionally adapted to mobile, but visually still dense or clipped.
4. Drawer, modal, popover and bottom-nav safe-area behavior is not yet standardized.

## Shared Root Causes

### 1. Layout shell inconsistency

- Some tabs render inside clean `flex-1 min-h-0 min-w-0` containers.
- Others still depend on child-level overflow behavior, which causes clipping, scroll conflicts or content pressure on mobile.

### 2. Fixed-width controls

- Select triggers, popovers, emoji picker, calendar filters and assignment controls still include widths optimized for desktop.
- These widths do not always collapse gracefully below 390px.

### 3. Bottom navigation interaction zone

- The bottom bar exists and is functional, but tab content still needs more consistent spacing and overlay behavior above the nav.
- Landscape and short-height devices remain a risk area.

### 4. Uneven mobile density

- Some views already switched from tables to cards on mobile.
- Others are technically responsive, but still too crowded for fast thumb-driven usage.

## Status by Area

### Already addressed in this recovery pass

- Conversas desktop layout restored after mobile regression.
- Chat message bubbles widened for mobile readability.
- Chat emoji picker made viewport-aware.
- Pipeline mobile columns made less rigid.
- Calendar month header and grid made less brittle on small screens.
- Calendar filters made width-responsive.
- Mobile More modal height and safe-area behavior improved.
- Dashboard date picker reduced to one month on mobile.
- Assignment select components made fluid on mobile.

### Still needs follow-up

- Functional QA across all tabs in real mobile viewport.
- UX simplification for dense tabs with analytics and settings.
- Manual landscape and keyboard testing.
- Final polish of drawers, modals and long forms.

## Per-Tab Plan

### Conversas

Priority: Critical

- Validate list-only and chat-only mobile states.
- Validate details panel overlay on mobile.
- Review message composer, emoji picker, media actions and reply bar on 320px to 430px widths.
- Ensure no element sits under the bottom nav when the conversation list is visible.

### Pipeline

Priority: High

- Keep horizontal mobile columns, but refine width and scroll feel.
- Confirm action menu fully replaces drag-and-drop for mobile.
- Add a clearer current-stage indicator if needed after QA.
- Verify cards remain readable in portrait and landscape.

### Calendário

Priority: High

- Keep mobile drawer pattern for upcoming, past and day events.
- Continue reducing pressure in filters and month navigation.
- Validate horizontal month grid scrolling on small devices.
- If month grid still feels too dense after QA, add a condensed mobile mode.

### Contatos

Priority: High

- Validate list/detail split on mobile.
- Confirm detail panel opens full width and back navigation is consistent.
- Review long forms, save actions and assignment selector spacing.
- Check tap target sizes for row actions and selection mode.

### Disparos

Priority: Medium

- Validate campaign list and status panel in narrow viewport.
- If the detail/status panel feels too dense, move it to drawer behavior on mobile.
- Confirm campaign modal remains usable with keyboard open.

### Propostas

Priority: Medium

- Mobile card view already exists.
- Validate filters, dialog actions and pagination spacing.
- Review proposal details modal for narrow screens.

### Dashboard

Priority: Medium

- Keep controls stacked and full-width on mobile.
- Validate KPI cards, charts and stale leads section in portrait mode.
- If tables remain dense, wrap them in explicit horizontal scroll containers.

### IA Agentes

Priority: Medium

- Validate long forms and bottom floating save bar.
- Confirm no clipped content below the viewport on mobile.
- Reduce action density where multiple controls compete in one row.

### Automações

Priority: Medium

- Validate header actions and form sections on narrow phones.
- Confirm switches and action buttons remain comfortable to tap.

### Integrações

Priority: Medium

- Validate QR area, instance actions and stacked cards.
- Confirm WhatsApp instance actions remain accessible without hover.
- Review modal/dialog footprint on small devices.

### Tracking

Priority: Medium

- Validate horizontal scroll tables and tab strip.
- Confirm form blocks, copy buttons and selectors do not overflow.
- Improve card conversion only if table usage remains painful after QA.

### Knowledge Base

Priority: Low

- Validate horizontal tabs and content spacing.
- Confirm upload and settings cards remain readable on mobile.

### Minha Conta

Priority: Low

- Validate profile and appearance cards in portrait mode.
- Confirm actions wrap cleanly and forms do not crowd.

### Meu Plano

Priority: Low

- Validate hero, plan cards and admin actions on mobile.
- Confirm no CTA gets clipped under the viewport or bottom nav.

### Gestão de Equipe

Priority: Low

- Mobile card version already exists.
- Validate action buttons, role selector and switch rows on small phones.

## Implementation Phases

### Phase 1

- Stabilize shared mobile shell behavior.
- Remove rigid widths from shared controls.
- Fix high-friction overlays and popovers.

### Phase 2

- Validate and refine main operational tabs.
- Conversas
- Pipeline
- Calendário
- Contatos

### Phase 3

- Refine secondary workflow tabs.
- Disparos
- Propostas
- Dashboard
- Integrações
- Tracking

### Phase 4

- Polish settings and admin tabs.
- IA Agentes
- Automações
- Knowledge Base
- Minha Conta
- Meu Plano
- Gestão de Equipe

### Phase 5

- Full QA in real mobile conditions.
- Portrait 320px, 360px, 390px, 430px
- Landscape
- Virtual keyboard open
- Safe area devices
- Regression pass on desktop

## Acceptance Criteria

1. Every main tab is usable at 320px width without clipped primary actions.
2. No critical content sits behind the bottom nav.
3. No primary modal or drawer becomes impossible to close on mobile.
4. Desktop layout remains unchanged except for explicit bug fixes.
5. Typecheck and production build remain green after each phase.

## Validation Checklist

- `npm run -s typecheck`
- `npm run -s build`
- Mobile navigation through all tabs
- Conversation list to chat flow
- Pipeline stage movement on mobile
- Calendar day drawer flow
- Contacts detail flow
- Proposal actions on cards
- Dashboard filters and chart visibility
- Integrations QR and instance actions

## Immediate Next Fixes After This Pass

1. Real-device or emulated walkthrough of every tab with authenticated session.
2. Tighten remaining dense forms and tables based on actual viewport captures.
3. Add or update mobile smoke coverage for the most failure-prone tabs.