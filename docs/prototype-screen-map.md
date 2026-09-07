# Prototype Screen Map

APP | SCREEN | SOURCE IMAGE | ROUTE | INTERACTIONS | NEXT
---|---|---|---|---|---

## Passenger

PASS | Onboarding 1 Marketplace | 015446 | /onboarding | Continue, X dismiss, policy links | /onboarding?page=1
PASS | Onboarding 2–4 | 015449–015455 | /onboarding | Swipe/Continue dots | /book
PASS | Book Ride empty | 015503 | /book?service=ride | Tabs, A/B, class, Now, steppers, Get offers | /location or /waiting
PASS | Book Experiences | 015530 | /book?service=experiences | Get offers (external sim), copy promo | stay
PASS | Book Ride filled airport | 015600–015809 | /book | Fill fields, return toggle, children Edit, terms | /waiting
PASS | Location search | 015612–015623 | /location | Type, Current location, Choose on map | /book or /map-pick
PASS | Map pick | 015634–015648 | /map-pick | Pin, Done | /book
PASS | Date/time picker | 015656–015743 | /book (sheet) | Pick date/time, Now | /book
PASS | Children seats sheet | 015753 | /book (sheet) | +/- seats | /book
PASS | Book Per Hour | 020053–020116 | /book?service=per_hour | Duration pills, another end | /waiting
PASS | Book Delivery | 020132–020224 | /book?service=delivery | Package fields | /waiting
PASS | Book Car Rental | 020310 | /book?service=car_rental | Location, Get offers external, promo | stay
PASS | Waiting offers | 020730 | /waiting/:id | Back, menu | /offers/:id or /rides
PASS | Rides Upcoming/Past | 021052 | /rides | Tabs, filter, search, open card | /waiting/:id or /offers/:id
PASS | Offer list | 021010–021015 | /offers/:id | Select offer card | /offer/:offerId
PASS | Offer Details | 021010–021106 | /offer/:offerId | Gallery, Show reviews, Book | /payment or reviews sheet
PASS | Latest reviews sheet | 021116–021148 | sheet | Close | /offer/:offerId
PASS | Payment sheet | 021240 | /payment | Card fields, Save, PAY | /rides (booked)
PASS | Support | 020338–020408 | /support | FAQ, contact | stay
PASS | Settings hub | 020401–020408 | /settings | Account, language, etc | /account
PASS | Account settings | 020532–020635 | /account | Edit name/email/phone, Delete | sheets / confirm

Bottom nav: Book · Rides · Support · Settings

## Driver

DRV | Carrier profile Individual/Legal | 012656–012712 | /onboarding/profile | Radios, fields, languages, terms | /onboarding/languages
DRV | Languages sheet | 012731–012739 | sheet | Toggle ≤6 | /onboarding/profile
DRV | Base location search | 012754–012803 | /onboarding/location | Search, Current, Map | /onboarding/map
DRV | Base location map | 012812–012902 | /onboarding/map | Pin, Done | /onboarding/zone
DRV | Operating zone | 013031–013045, 014230 | /onboarding/zone | Add zone, Next/Save | /onboarding/documents
DRV | Documents | 013214–013321 | /onboarding/documents | Upload sim, Next | /onboarding/vehicle
DRV | Vehicle photos + requirements | 013410–013555 | /onboarding/photos | I understand, add photos, Done | /onboarding/edit-vehicle
DRV | Edit vehicle | 013709–013814 | /onboarding/edit-vehicle | Amenities, autocancel, Next | /onboarding/payment
DRV | Payment details | 013851–013958 | /onboarding/payment | Periods, currency, Save | /home/requests
DRV | Requests New | 014054–014104, 014403–014416 | /home/requests | Offer price, tabs, FAB | bid sheet or activation modal
DRV | Activation modal | 014054 | dialog | Dismiss / go profile | stay
DRV | Offer price sheet | (inferred) | sheet | Enter price, Submit | /home/requests?tab=offers
DRV | Rides calendar Day/Week/Month | 014126–014218 | /home/rides | Tabs, filter, Add day off | stay
DRV | Chats | (inferred empty) | /home/chats | Open thread | /chat/:id
DRV | Settings | 014239–014301 | /home/settings | Profile, zone, vehicles, payment, instructions | subroutes
DRV | Instructions | 014313–014348 | /instructions | Accordions, Contact, Go to requests | /home/requests

Bottom nav: Requests · Rides · Chats · Settings

## Skipped (not app UI)

Chrome, Outlook, One UI Home, Permission controller, screen recordings (flow reference only).
