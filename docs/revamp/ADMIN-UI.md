# Administration interface

2026-10-20. Local implementation; no deployment.

## Approved direction

The user explicitly allows a new administration UI and different page grouping:
modern, simple and easy to operate. This supersedes the earlier instruction to
copy the archived **private** interface. Public pages retain the existing 1:1
visual acceptance policy and its two previously approved deviations.

Admin acceptance therefore covers preserved workflows and server permissions,
clear form labels and action states, keyboard operation, desktop/mobile layout,
light/dark readability, and review of actual screenshots. Comparing the new
admin workspace pixel-for-pixel with the archive would test an obsolete design
requirement. New screenshots are review evidence, not an automatically approved
visual baseline. Existing public pixel comparison thresholds remain unchanged.

## Current implementation

- A separate management workspace with desktop sidebar and collapsible mobile
  navigation. Sections group content, site settings, and system management.
- A real overview containing permitted quick links. No fabricated counts or
  status indicators; future metrics must come from actual authorized responses.
- Shared panels, buttons, fields, avatars, status badges and responsive tables.
  Resource actions are visible without hovering. Dark mode follows the existing
  user preference; no separate admin-only preference is introduced.
- Member search, visible editing/order/delete/restore actions; history editing
  and sanitized preview; grouped site configuration and image uploads; homepage
  link editing and real public-component preview; log filtering/selection;
  account/access controls; backup settings/downloads; personal security settings.
- Named native controls, a skip link, focus after route navigation, Escape and
  focus restoration for the mobile navigation, reduced-motion CSS. Tables scroll
  within their panel rather than widening the page.

The UI does not grant authority. Every private read/write still verifies the
server session and current upstream role. Super-admin navigation is hidden from
ordinary admins, and the corresponding BFF remains protected independently.
Element Plus supplies dialogs/messages; resource forms use simple native
controls to keep common workflows explicit. Private query/UI code loads after
the route verifies authentication.

## Still required

Article editing now joins the same workspace, with a focused client-only editor,
safe formula/diagram preview, image binding to one unpublished draft, import,
unsaved-edit protection, publish/delete/restore and full-width stacked phone
panes. Article-specific checks pass 6/6 and the corrected output's broader
selection passes 82/82; see [article evidence](logs/12-admin-articles/README.md).
Activity administration is now locally accepted, including review, five-type
forms, participants, ranking and settlement; see [event evidence](logs/14-admin-events/README.md).
Advanced public Markdown and secondary administrator workflows remain open.
The foundation passes 28/28 actual BFF/interface checks on desktop/mobile,
including 320px containment, named controls, keyboard navigation, role denials
and the previously failing populated-table/dialog operations. Thirty-six actual
light/dark screenshots are retained; representative screenshots are committed
with the integration evidence. All four recursive gates pass (686 units),
production maps are absent, and the 14 public cold-route graphs pass.
Whole-site regression and another budget check remain required after
editor/activity integration. Current gate evidence
and open defects belong to [the integration log](logs/11-admin-integration/README.md)
and [STATUS](STATUS.md).
