import { Agent } from "@atproto/api";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { Context, Hono } from "hono";
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

type LBZRequest = {
  listen_type: string;
  payload: {
    listened_at: number;
    track_metadata: {
      track_name: string;
      artist_name: string;
      release_name: string;
    };
  }[];
};
app.post("/lbz/1/submit-listens", async (c: Context) => {
  console.log("/lbz/1/submit-listens");
  const body: LBZRequest = await c.req.json();
  const token = c.req.header("Authorization")?.split("Token ")[1];
  if (!token) {
    return c.json({ error: "Missing token" }, 401);
  }

  const apiKeyRecord = (
    await db.select().from(apiKey).where(eq(apiKey.key, token)).limit(1)
  )[0];

  const oauthsession = await atclient.restore(apiKeyRecord.authorDid);
  const agent = new Agent(oauthsession);
  if (!agent) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Process each listen in the payload
  const processedListens = [];

  for (const listen of body.payload) {
    const { track_name, artist_name, release_name } = listen.track_metadata;

    // Build query for MusicBrainz
    const queryParts: string[] = [];
    if (track_name) {
      queryParts.push(`title:"${track_name}"`);
    }

    if (artist_name) {
      queryParts.push(`artist:"${artist_name}"`);
    }

    if (release_name) {
      queryParts.push(`release:"${release_name}"`);
    }

    const query = queryParts.join(" AND ");

    try {
      // Query MusicBrainz API
      const res = await fetch(
        `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(
          query
        )}&fmt=json`,
        {
          headers: {
            "User-Agent": "tealtracker/0.0.1",
          },
        }
      );

      if (!res.ok) {
        console.error(`MusicBrainz API returned ${res.status}`);
        // Continue with basic data even if MusicBrainz query fails
      } else {
        const data = await res.json();
        const recording = data.recordings?.[0]; // Get the first matching recording

        if (recording) {
          // Create a formatted listen entry according to the Lexicon schema
          const playEntry = {
            trackName: track_name,
            trackMbId: recording.id || undefined,
            recordingMbId: recording.id || undefined,
            duration: recording.length
              ? Math.floor(recording.length / 1000)
              : undefined,
            artistNames: recording["artist-credit"]
              ? recording["artist-credit"].map((credit: any) => credit.name)
              : [artist_name],
            artistMbIds: recording["artist-credit"]
              ? recording["artist-credit"]
                  .map((credit: any) => credit.artist?.id)
                  .filter(Boolean)
              : undefined,
            releaseName: recording.releases?.[0]?.title || release_name,
            releaseMbId: recording.releases?.[0]?.id,
            isrc: recording.isrcs?.[0],
            musicServiceBaseDomain: "local", // Default value
            submissionClientAgent: "teal-inscriber/0.0.1 (web)",
            playedTime: new Date(listen.listened_at * 1000).toISOString(),
          };

          processedListens.push(playEntry);
          continue;
        }
      }

      // If MusicBrainz query fails or no match found, use basic data
      const basicPlayEntry = {
        trackName: track_name,
        artistNames: [artist_name],
        releaseName: release_name,
        musicServiceBaseDomain: "local",
        submissionClientAgent: "teal-inscriber/0.0.1 (web)",
        playedTime: new Date(listen.listened_at * 1000).toISOString(),
      };

      processedListens.push(basicPlayEntry);
    } catch (error) {
      console.error("Error processing listen:", error);
      // Add basic entry on error
      const errorPlayEntry = {
        trackName: track_name,
        artistNames: [artist_name],
        releaseName: release_name,
        musicServiceBaseDomain: "local",
        submissionClientAgent: "teal-inscriber/0.0.1 (web)",
        playedTime: new Date(listen.listened_at * 1000).toISOString(),
      };

      processedListens.push(errorPlayEntry);
    }
  }

  // Here you would typically save these processedListens to your database
  // For now, we'll just log them
  console.log("Processed listens:", JSON.stringify(processedListens));

  // for each processed listen, create a play entry
  for (const listen of processedListens) {
    agent.com.atproto.repo.createRecord({
      repo: agent.did ?? apiKeyRecord.authorDid,
      collection: "fm.teal.alpha.feed.play",
      record: {
        ...listen,
      },
    });
  }

  return c.json({
    success: true,
    processedCount: processedListens.length,
    processedListens,
  });
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
