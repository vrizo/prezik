(optional) customisation on the second step:

- voice: [dropdown: male / female / neutral] (neutral by default)
- enable zooming [toggle] (on by default)
- length [slider from short to long] (short by default)
- captions [toggle] (on by default)
- format: vertical (tiktok) or horizontal [dropdown] (horizontal 16:9 by default)

---
style of highlights: hand drawn, strict frame
---
email notifications
---
Clicking Start creating now plays the transition — the grainy colorful background expands from the center point out to fill the whole screen, with a "Creating your demo…" flourish, before revealing the Creating phase


- in the current version there is no way to edit plan or text, so it is generated ready-only.
---
show transcript button at the end
---
Currently the flow generates a video that focuses on the documentation (check logs of logs/run-12). But the idea is to one agent to investigate all the information, get the knowledge about the product, and then record the app, the product, the service rather than the documentation. It is intended for tools, services, not for demoing landing pages.

Please iterate the flow and try to adjust it to focus the recording on the product, not on docs.

If the agent stucks because it requires test credentials, but credentials are not provided, then it should stop and report to the UI. The UI should accept this system message. The user should start again providing the test credentials. This is actual for the products, services, web sites that require signing in. It is not requires for the pages that don't need registration.
---
save in local storage the selected options
---
add human agent presenter
---

Custom instructions:

There are other agents working in parallel. Avoid conflicts.

Be careful with reading log files, limit the length, otherwise it will consume the entire context immediately.

Feel free to use sub agents to verify with clear context if needed.

Do NOT add hidden fallbacks, tons of guards and mocks, silent recovery flows, and so on.

Please save tokens and my money by orchestrating Opus 4.6/4.8 and Sonnet 5 models depending on the complexity. Do not use MAX.

You should be a manager of agents and delegate work if possible.

Please write docs, skills and replies in plain English with little formatting (I don't like to read a lot).

Do not change production queue or AI worker. Only staging env is allowed to update.

Use xcode mcp (open the project if needed).

There are no users yet, so no backward compatibility needed. Do not store any legacy attributes.