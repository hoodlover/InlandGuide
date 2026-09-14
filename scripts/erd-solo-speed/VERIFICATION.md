Solo FIS screen lookup speed update, September 14, 2026.

The solo lookup sends `solo=1`; entered shipment and batch lookups retain their existing URL and reader path.
The solo reader excludes window-menu copies of booking titles and unrelated screens from discovery, uses the known Java parent during selection checks, and reads the chosen frame directly. It reads fresh data on every solo check and does not populate or return the regular lookup's summary cache. Cancellation, DG, reefer, rail-move, required-column, and shipment checks remain in the read path.

Verification against simultaneously open FIS bookings:

- Shipment 40770246: solo 2.79 seconds, regular 9.25 seconds; every JSON field matched.
- Shipment 95486138: solo 0.78 seconds, regular 4.83 seconds; every JSON field matched after switching bookings.
- Browser test against the installed local page: the solo button requested `http://127.0.0.1:47835/s8100-summary?equipment=skip&solo=1` and displayed shipment 95486138, Chicago to New York, MAERSK NACALA 638S USW, September 15 port cutoff at 4 PM, ERD September 4, and LRD September 8 at 6 AM. The UI reported ready in 4.5 seconds. Browser clipboard permission was unavailable in the test browser; calculation and display succeeded.

Installed locally into the current GOT-ERD-Team v1.0.18 directory. The floating tool was restarted to load the updated page. Original executable, source, and page are backed up beside this file. Team release archives were not updated.
