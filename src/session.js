export class GameSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.data = {
      story: "",
      state: {
        day: 1,
        distance: 0,
        food: 100,
        materials: 50,
        health: 100,
      },
    };
  }

  async fetch(request) {
    const method = request.method;

    if (method === "GET") {
      const stored = await this.state.storage.get("data");
      return new Response(JSON.stringify(stored || this.data), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "POST") {
      const body = await request.json();
      const stored = (await this.state.storage.get("data")) || this.data;
      if (body.story) stored.story = body.story;
      if (body.state) stored.state = body.state;
      await this.state.storage.put("data", stored);
      return new Response("ok");
    }

    return new Response("Unsupported method", { status: 405 });
  }
}
