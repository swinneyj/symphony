# TikTok Direct Post audit resubmission

## Demo recording requirements

Record one continuous end-to-end flow in the production website. Keep a visible text overlay reading `https://symphonyapp.company` for the entire Symphony portion; do not rely on Chrome's shortened address bar.

1. Start on `https://symphonyapp.company/login` with the full URL visible. Sign in and open TikTok Integration.
2. Show Login Kit and the connected creator's nickname and username.
3. Choose Direct Post. Pause while Symphony retrieves live `creator_info`, then show the creator's maximum video duration.
4. Select a video and show its in-app preview. Enter an editable title/caption. State that Symphony adds no preset text, hashtags, logos, or watermarks.
5. Open the privacy dropdown and show that it starts with “Select privacy” and contains only TikTok's returned options.
6. Show Comment, Duet, and Stitch unchecked by default. Point out any option TikTok has disabled and greyed out.
7. Turn Content disclosure on. Before selecting a type, show that posting is blocked. Select Your brand and show the “Promotional content” label. Select Branded content and show the “Paid partnership” label. Show that Only me is unavailable for branded content.
8. Show the consent immediately above the publish button, including both the Branded Content Policy and Music Usage Confirmation when branded content is selected.
9. Click Post to TikTok once. Show processing status, automatic status checks, `PUBLISH_COMPLETE`, and the returned TikTok post ID.
10. Use “View the published post on TikTok.” End the recording on the actual TikTok post page with the creator username, posted video, privacy/status, and caption visible. Hold this final shot for at least 10 seconds.

The demo should be a fresh recording made after the production deployment. Do not reuse the August 6 recording: it does not visibly demonstrate every disclosure and consent state, and its address bar does not show the full website URL.

## Suggested audit explanation

Symphony is a public social media management platform for creators. Its Direct Post flow now demonstrates all five Required UX Implementation sections: it retrieves current creator information before Direct Post and again server-side before publishing; displays the selected creator and validates the uploaded video's duration; requires a manual privacy selection from TikTok's returned options; leaves Comment, Duet, and Stitch off by default and disables unavailable interactions; implements commercial-content disclosure, labels, branded-content privacy restrictions, and the required policy consent; previews the exact video and editable title without added watermarks; waits for explicit user consent before transfer; warns that processing may take several minutes; polls TikTok publish status; and links to the completed TikTok post. The attached continuous demo keeps `https://symphonyapp.company` visibly overlaid and ends on the published TikTok post.
