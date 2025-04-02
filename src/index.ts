import { sanitizeUrl } from "@braintree/sanitize-url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import crypto from "node:crypto";
import pino from "pino";
import { atclient } from "./auth/client";
import { getAuthRouter } from "./auth/router";
import { EnvWithCtx, setupContext, TealContext } from "./ctx";
import { getSessionAgent } from "./lib/auth";
import { apiKey, db } from "./lib/db";
import { env } from "./lib/env";

function generateRandomKey(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

const HEAD = `<head>
    <link rel="stylesheet" href="/latex.css">
    </head>`;

const logger = pino({ name: "server start" });

const app = new Hono<EnvWithCtx>();

app.use((c, next) => setupContext(c, db, logger, next));

app.route("/oauth", getAuthRouter());

app.get("/client-metadata.json", (c) => {
  return c.json(atclient.clientMetadata);
});

app.get("/", async (c) => {
  const tealSession = getCookie(c, "tealSession");

  // Serve logged in content
  if (tealSession) {
    // const followers = await agent?.getFollowers();
    return c.html(
      `
    ${HEAD}
      <div id="root">
        <div id="header" style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
          <div>
            <h1>teal.fm</h1>
            <p>Your music, beautifully tracked. (soon.)</p>
          </div>
          <div style=" width: 100%; display: flex; flex-direction: row; justify-content: space-between; gap: 0.5rem;">
            <div>
              <a href="/">home</a>
              <a href="/apikey">stamp</a>
            </div>
            <form action="/logout" method="post" class="session-form">
              <button type="submit" style="background-color: #cc0000; color: white; border: none; padding: 0rem 0.5rem; border-radius: 0.5rem;">logout</button>
            </form>
          </div>
        </div>
        <div class="container">

        </div>
      </div>`
    );
  }

  // Serve non-logged in content
  return c.html(
    `
    ${HEAD}
    <div id="root">
    <div id="header">
      <h1>teal.fm</h1>
      <p>Your music, beautifully tracked. (soon.)</p>
      <div style=" width: 100%; display: flex; flex-direction: row; justify-content: space-between; gap: 0.5rem;">
        <div>
          <a href="/">home</a>
          <a href="/apikey">stamp</a>
        </div>
        <button style="background-color: #acf; color: white; border: none; padding: 0rem 0.5rem; border-radius: 0.5rem;"><a href="/login">Login</a></button>
      </div>
    </div>
    <div class="container">
      <div class="signup-cta">
        Don't have an account on the Atmosphere?
        <a href="https://bsky.app">Sign up for Bluesky</a> to create one now!
      </div>
    </div>
  </div>`
  );
});

app.get("/login", (c) => {
  const tealSession = getCookie(c, "tealSession");

  return c.html(
    `
    ${HEAD}
    <div id="root">
    <div id="header">
      <h1>teal.fm</h1>
      <p>Your music, beautifully tracked. (soon.)</p>
      <div style=" width: 100%; display: flex; flex-direction: row; justify-content: space-between; gap: 0.5rem;">
        <div>
          <a href="/">home</a>
          <a href="/apikey">stamp</a>
        </div>
        <div />
      </div>
    </div>
    <div class="container">
      <form action="/login" method="post" class="login-form">
        <input
          type="text"
          name="handle"
          placeholder="Enter your handle (eg alice.bsky.social)"
          required
        />
        <button type="submit">Log in</button>
      </form>
      <div class="signup-cta">
        Don't have an account on the Atmosphere?
        <a href="https://bsky.app">Sign up for Bluesky</a> to create one now!
      </div>
    </div>
  </div>`
  );
});

app.post("/login", async (c: TealContext) => {
  const body = await c.req.parseBody();
  let { handle } = body;
  // shouldn't be a file, escape now
  if (handle instanceof File) return c.redirect("/login");
  handle = sanitizeUrl(handle);
  console.log("handle", handle);
  // Initiate the OAuth flow
  try {
    console.log("Calling authorize");
    if (typeof handle === "string") {
      const url = await atclient.authorize(handle, {
        scope: "atproto transition:generic",
      });
      console.log("Redirecting to oauth login page");
      console.log(url);
      return Response.redirect(url);
    }
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not authorize user" });
  }
});

app.post("/logout", (c) => {
  deleteCookie(c, "tealSession");
  // TODO: delete session record from db??
  return c.redirect("/");
});

app.get("/apikey", (c) => {
  // check logged in
  const tealSession = getCookie(c, "tealSession");
  if (!tealSession) {
    return c.redirect("/login");
  }
  return c.html(
    `
    ${HEAD}
    <div id="root">
    <div id="header">
      <h1>teal.fm</h1>
      <p>Your music, beautifully tracked. (soon.)</p>
      <div style=" width: 100%; display: flex; flex-direction: row; justify-content: space-between; gap: 0.5rem;">
        <div>
          <a href="/">home</a>
          <a href="/apikey">stamp</a>
        </div>
        <form action="/logout" method="post" class="session-form">
          <button type="submit" style="background-color: #cc0000; color: white; border: none; padding: 0rem 0.5rem; border-radius: 0.5rem;">logout</button>
        </form>
      </div>
    </div>
    <div class="container">
      <p>click button make api key go boom clap</p> 
      <form action="/apikey" method="post" class="login-form" style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="submit" style="width: 15%">API KEY!</button>
      </form>
    </div>
  </div>`
  );
});

app.post("/lbz/1/submit-listens", async (c: TealContext) => {
  const body = c.req.parseBody();

  console.log(body);

  return c.json({ success: true });
});

app.post("/apikey", async (c: TealContext) => {
  const key = generateRandomKey(32);

  const agent = await getSessionAgent(c);

  if (agent && agent.did) {
    await db.insert(apiKey).values({
      authorDid: agent.did,
      key,
    });

    return c.html(
      `
      ${HEAD}
      <div id="root">
      <div id="header">
        <h1>teal.fm</h1>
        <p>Your music, beautifully tracked. (soon.)</p>
        <div style=" width: 100%; display: flex; flex-direction: row; justify-content: space-between; gap: 0.5rem;">
          <div>
            <a href="/">home</a>
            <a href="/apikey">stamp</a>
          </div>
          <form action="/logout" method="post" class="session-form">
            <button type="submit" style="background-color: #cc0000; color: white; border: none; padding: 0rem 0.5rem; border-radius: 0.5rem;">logout</button>
          </form>
        </div>
      </div>
      <div class="container">
        <h2 class="stamp-success">Success! 🎉</h2>
        <p>${key}</p>
      </div>
    </div>`
    );
  }
  return c.html(
    `<h1>doesn't look like you're logged in... try <a href="/login">logging in?</a></h1>`
  );
});

app.use("/*", serveStatic({ root: "/public" }));

const run = async () => {
  logger.info("Running in " + navigator.userAgent);
  if (navigator.userAgent.includes("Node")) {
    serve(
      {
        fetch: app.fetch,
        port: env.PORT,
        hostname: env.HOST,
      },
      (info) => {
        logger.info(
          `Listening on ${
            info.address == "::1"
              ? "http://localhost"
              : // TODO: below should probably be https://
                // but i just want to ctrl click in the terminal
                "http://" + info.address
          }:${info.port} (${info.family})`
        );
      }
    );
  }
};

run();

export default app;
