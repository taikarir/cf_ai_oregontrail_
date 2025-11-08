/**
* Oregon Trail AI Worker
*/

import { GameSession } from "./session.js";
export { GameSession };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(await getHTML(), { headers: { "Content-Type": "text/html" } });
    }

    const sessionId = request.headers.get("Cookie")?.match(/session=([^;]+)/)?.[1] || crypto.randomUUID();
    const id = env.SESSIONS.idFromName(sessionId);
    const session = env.SESSIONS.get(id);

    // start new game
    if (url.pathname === "/play") {
      const story = `
You are leading a wagon party westward on the Oregon Trail.
It’s the spring of 1848, and your supplies are packed.
You have 100 units of food, 50 materials, and 100 health.
Each day, your group consumes food as you travel.

What will you do next?
* Begin the journey.
* Trade for extra supplies.
* Rest before departing.
`;

      const initialState = {
        day: 1,
        distance: 0,
        food: 100,
        materials: 50,
        health: 100,
      };

      await session.fetch("https://session", {
        method: "POST",
        body: JSON.stringify({ story, state: initialState }),
      });

      return new Response(JSON.stringify({ story }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly`,
        },
      });
    }

    // CONTINUE
    if (url.pathname === "/continue" && request.method === "POST") {
      const { storySoFar, playerChoice } = await request.json();

      // Load session
      const res = await session.fetch("https://session", { method: "GET" });
      const data = await res.json();
      const { state } = data;

      const stats = `
          Day: ${state.day}
          Distance: ${state.distance}
          Food: ${state.food}
          Materials: ${state.materials}
          Health: ${state.health}
      `;

      const prompt = `
        You are running an Oregon Trail text adventure.

        Player stats before action:
        ${stats}

        The player chose: "${playerChoice}"

        1. Decide what happens next in the story (max 80 words).
        2. Decide how much each stat CHANGES as a result. NOT the new stat value.
        Return your response as **strict JSON** in this format:

        {
          "story": "<short continuation text>",
          "changes": {
            "day": <integer>,
            "distance": <integer>,
            "food": <integer>,
            "materials": <integer>,
            "health": <integer>
          },
          "nextOptions": ["<option1>", "<option2>", "<option3>"]
        }

        Do NOT include extra commentary or text outside the JSON.
    `;

      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt });

      let parsed;
      try {
        parsed = JSON.parse(result.response);
      } catch {
        // fallback if AI gives malformed JSON
        parsed = {
          story: result.response,
          changes: { day: 1, distance: 10, food: -5, materials: 0, health: 0 },
          nextOptions: ["Continue", "Rest", "Trade"]
        };
      }

      state.day += parsed.changes.day || 0;
      state.distance += parsed.changes.distance || 0;
      state.food = Math.max(0, state.food + (parsed.changes.food || 0));
      state.materials = Math.max(0, state.materials + (parsed.changes.materials || 0));
      state.health = Math.max(0, Math.min(100, state.health + (parsed.changes.health || 0)));

      const story = `${parsed.story}\n\n Stats:
          Day ${state.day}
          Distance: ${state.distance} miles
          Food: ${state.food}
          Materials: ${state.materials}
          Health: ${state.health}

          What will you do next?
          1. ${parsed.nextOptions[0]}
          2. ${parsed.nextOptions[1]}
          3. ${parsed.nextOptions[2]}`;

      await session.fetch("https://session", {
        method: "POST",
        body: JSON.stringify({ story, state }),
      });

      return new Response(JSON.stringify({ story }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly`,
        },
      });
    }

    return new Response("Oregon Trail AI Worker running.");
  },
};

//
async function getHTML() {
  return `
  <html>
    <body style="font-family:monospace; background:#fdf6e3; padding:2rem;">
      <h1>Oregon Trail, AI edition</h1>
      <div id="story" style="white-space:pre-wrap;"></div>
      <input id="choice" placeholder="Enter choice..." style="width:80%;" />
      <button onclick="sendChoice()">Send</button>
      <script>
        const storyDiv = document.getElementById("story");
        const choiceInput = document.getElementById("choice");
        let storySoFar = "";

        async function startGame() {
          const res = await fetch("/play");
          const data = await res.json();
          storySoFar = data.story;
          storyDiv.innerText = storySoFar;
        }

        async function sendChoice() {
          const playerChoice = choiceInput.value.trim();
          if (!playerChoice) return;
          const res = await fetch("/continue", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ storySoFar, playerChoice })
          });
          const data = await res.json();
          storySoFar += "\\n\\n" + data.story;
          storyDiv.innerText = storySoFar;
          choiceInput.value = "";
        }

        startGame();
      </script>
    </body>
  </html>
  `;
}
