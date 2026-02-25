const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/* =========================
   1️⃣ GENERATE QR
========================= */
app.post("/presence/qr/generate", async (req, res) => {
  try {
    const { course_id, session_id } = req.body;

    if (!course_id || !session_id) {
      return res.status(400).json({
        ok: false,
        message: "course_id and session_id required"
      });
    }

    const qr_token =
      "TKN-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const EXPIRE_SECONDS = 120;
    const expires_at = new Date(Date.now() + EXPIRE_SECONDS * 1000);

    await db.collection("qr_sessions").add({
      course_id,
      session_id,
      qr_token,
      created_at: new Date(),
      expires_at: expires_at
    });

    return res.json({
      ok: true,
      data: {
        qr_token,
        expires_at
      }
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


/* =========================
   2️⃣ CHECKIN
========================= */
app.post("/presence/checkin", async (req, res) => {
  try {
    const { user_id, qr_token } = req.body;

    if (!user_id || !qr_token) {
      return res.status(400).json({
        ok: false,
        message: "user_id and qr_token required"
      });
    }

    const snapshot = await db
      .collection("qr_sessions")
      .where("qr_token", "==", qr_token)
      .get();

    if (snapshot.empty) {
      return res.json({
        ok: false,
        message: "Token invalid"
      });
    }

    const qrData = snapshot.docs[0].data();

    if (new Date() > qrData.expires_at.toDate()) {
      return res.json({
        ok: false,
        message: "QR expired"
      });
    }

    const { course_id, session_id } = qrData;

    const existingPresence = await db
      .collection("presences")
      .where("user_id", "==", user_id)
      .where("course_id", "==", course_id)
      .where("session_id", "==", session_id)
      .get();

    if (!existingPresence.empty) {
      return res.json({
        ok: false,
        message: "User already checked in"
      });
    }

    // 🔥 Buat docRef dulu supaya dapat ID
    const docRef = db.collection("presences").doc();
    const presence_id = docRef.id;

    await docRef.set({
      presence_id,
      user_id,
      course_id,
      session_id,
      qr_token,
      device_id: "dev-" + Math.floor(Math.random() * 1000),
      status: "checked_in",
      ts: new Date()
    });

    return res.json({
      ok: true,
      data: {
        presence_id,
        status: "checked_in"
      }
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


/* =========================
   3️⃣ STATUS
========================= */
app.get("/presence/status", async (req, res) => {
  try {
    const { user_id, course_id, session_id } = req.query;

    if (!user_id || !course_id || !session_id) {
      return res.status(400).json({
        ok: false,
        message: "Missing query parameters"
      });
    }

    const snapshot = await db
      .collection("presences")
      .where("user_id", "==", user_id)
      .where("course_id", "==", course_id)
      .where("session_id", "==", session_id)
      .get();

    if (snapshot.empty) {
      return res.json({
        ok: false,
        message: "Not Found"
      });
    }

    const data = snapshot.docs[0].data();

    return res.json({
      ok: true,
      data: {
        user_id,
        course_id,
        session_id,
        status: data.status,
        last_ts: data.ts
      }
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


exports.api = functions.https.onRequest(app);