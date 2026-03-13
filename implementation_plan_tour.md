# Guided Tour Fix and UX Improvement Plan

## Goal Description
The guided tour currently restarts continuously, likely due to a state persistence issue in the `onboarding_progress` table or use of the caching query in [useOnboardingProgress.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useOnboardingProgress.ts). Additionally, the tour needs a "Help" button to be reactivated manually and requires UI/UX improvements to look better and be more useful. We must fix this bug without causing any regressions to existing functionality.

## Proposed Changes

### 1. Fix Persistence Bug in [useOnboardingProgress.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useOnboardingProgress.ts)
- **Issue:** The `tour_completed_tabs` state might not be returning correctly, or the mutation fails silently (or fails to invalidate the cache properly).
- **Fix:** 
  - Verify the SQL migration for `onboarding_progress` to ensure `tour_completed_tabs` is defined correctly (e.g., as `JSONB` or `text[]`).
  - Ensure that [markTourTabCompleted](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useOnboardingProgress.ts#153-164) properly triggers a cache invalidation or optimistic update so the UI immediately stops showing the tour.

### 2. Add a Manual Trigger ("Help" Button)
- Modify [SolarZapLayout.tsx](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/SolarZapLayout.tsx) (and potentially `SolarZapNav.tsx`) to include a subtle "Help" or "Tour" button (e.g., a `LifeBuoy` icon or `HelpCircle` icon).
- When clicked, it should call `guidedTour.startTour()` and bypass the `tabAlreadyCompleted` check for that specific session.
- To allow manual triggering, we will update [useGuidedTour.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useGuidedTour.ts) to explicitly allow [startTour()](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useGuidedTour.ts#35-40) to override the completion check.

### 3. Improve Tour UX/UI ([GuidedTour.tsx](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/components/onboarding/GuidedTour.tsx))
- Enhance the visual design of [GuidedTour.tsx](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/components/onboarding/GuidedTour.tsx) using Tailwind CSS and Shadcn UI components.
- Add better animations (e.g., `animate-in fade-in zoom-in`).
- Make the target highlighter more polished (e.g., using [ring](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useOnboardingProgress.ts#24-26) instead of just a border, with a softer backdrop).
- Improve the popover styling (better typography, clearer buttons).

### 4. Integration of Skills (00-skill-manager)
- As requested, identify and integrate Skills. Given the task, we should document how the system's `00-skill-manager` can be used to load any UX/UI or debugging skill dynamically if needed in the future, although the direct implementation here uses standard React/Tailwind.

## Verification Plan
### Automated Tests
- Run `npm run typecheck` and `npm run lint` to ensure no Typescript or ESLint errors are introduced.
- Build the app using `npm run build` to verify production assets compile correctly.

### Manual Verification
- Start the development server (`npm run dev`).
- Open a fresh Incognito window, log in.
- Verify the tour starts automatically on the first visit.
- Complete or skip the tour.
- Refresh the page to verify it **does NOT** restart automatically.
- Click the new "Help/Tour" button. Verify the tour restarts correctly.
- Ensure all other tabs (Pipeline, Calendar, etc.) work flawlessly without regressions.
