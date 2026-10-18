const express = require('express');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

app.use(express.json({ limit: '2mb' }));

// ==================================================
// FIREBASE ADMIN
// ==================================================

let serviceAccount;

try {
  serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}'
  );
} catch (e) {
  console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON');
  process.exit(1);
}

if (!serviceAccount.project_id) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const messaging = admin.messaging();

const SECRET =
  process.env.SESSION_SECRET ||
  'change-me';

const ADMIN_UID =
  process.env.ADMIN_UID || '';

const ROOT = __dirname;


// ==================================================
// HELPERS
// ==================================================

const clean = (v) =>
  String(v ?? '').trim();

const now = () =>
  Date.now();

const vals = (x) =>
  Object.entries(x || {}).map(
    ([id, v]) => ({
      id,
      ...v
    })
  );


// ==================================================
// STUDENT TOKEN
// ==================================================

function studentToken(student) {

  return jwt.sign(
    {
      type: 'student',
      studentId: student.id,
      name: student.name
    },
    SECRET,
    {
      expiresIn: '12h'
    }
  );

}


// ==================================================
// STUDENT AUTH
// ==================================================

function requireStudent(
  req,
  res,
  next
) {

  try {

    const token =
      (
        req.headers.authorization || ''
      ).replace(
        /^Bearer\s+/i,
        ''
      );

    const decoded =
      jwt.verify(
        token,
        SECRET
      );

    if (
      decoded.type !==
      'student'
    ) {

      throw new Error(
        'Invalid student'
      );

    }

    req.student =
      decoded;

    next();

  }
  catch (e) {

    res.status(401).json({
      error:
        'Student login required'
    });

  }

}


// ==================================================
// ADMIN AUTH
// ==================================================

async function requireAdmin(
  req,
  res,
  next
) {

  try {

    const token =
      (
        req.headers.authorization ||
        ''
      ).replace(
        /^Bearer\s+/i,
        ''
      );

    const decoded =
      await admin
        .auth()
        .verifyIdToken(
          token
        );

    if (
      decoded.uid !==
      ADMIN_UID
    ) {

      return res
        .status(403)
        .json({
          error:
            'Not an authorized admin'
        });

    }

    req.admin =
      decoded;

    next();

  }
  catch (e) {

    res.status(401).json({
      error:
        'Admin login required'
    });

  }

}


// ==================================================
// ADMIN FCM TOKENS
// ==================================================

async function getAdminTokens() {

  const snap =
    await db
      .ref(
        `admins/${ADMIN_UID}/fcmTokens`
      )
      .once('value');

  return Object.values(
    snap.val() || {}
  );

}


// ==================================================
// PUSH NOTIFICATION
// ==================================================

async function pushAdmin(
  title,
  body,
  data = {}
) {

  const tokens = [
    ...new Set(
      (
        await getAdminTokens()
      ).filter(Boolean)
    )
  ];

  if (!tokens.length) {
    return;
  }

  try {

    await messaging
      .sendEachForMulticast({

        tokens,

        notification: {
          title,
          body
        },

        data:
          Object.fromEntries(
            Object.entries(data).map(
              ([k, v]) => [
                k,
                String(v)
              ]
            )
          ),

        webpush: {

          fcmOptions: {
            link:
              '/admin.html'
          }

        }

      });

  }
  catch (e) {

    console.error(
      'FCM error:',
      e.message
    );

  }

}


// ==================================================
// PUBLIC BOOTSTRAP
// ==================================================

app.get(
  '/api/bootstrap',
  async (req, res) => {

    try {

      const s =
        (
          await db
            .ref('settings')
            .once('value')
        ).val() || {};

      res.json({

        siteName:
          s.siteName ||
          'SEVEN NURSES',

        headerTitle:
          s.headerTitle ||
          'SEVEN NURSES',

        subtitle:
          s.subtitle ||
          'Online Nursing Examination',

        logoUrl:
          s.logoUrl || '',

        backgroundUrl:
          s.backgroundUrl || '',

        notice:
          s.notice || '',

        footerText:
          s.footerText ||
          '© SEVEN NURSES',

        headerColor:
          s.headerColor ||
          '#1769e0',

        passMarkDefault:
          s.passMarkDefault ??
          40

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Bootstrap failed'
      });

    }

  }
);


// ==================================================
// STUDENT LOGIN
// ==================================================

app.post(
  '/api/student/login',
  async (req, res) => {

    try {

      const name =
        clean(
          req.body.name
        );

      const pin =
        clean(
          req.body.pin
        );

      if (!name || !pin) {

        return res
          .status(400)
          .json({
            error:
              'Name and PIN are required'
          });

      }

      const commonPin =
        (
          await db
            .ref(
              'settings/commonExamPin'
            )
            .once('value')
        ).val();

      if (
        String(
          commonPin || ''
        ) !== pin
      ) {

        return res
          .status(401)
          .json({
            error:
              'Wrong Exam PIN'
          });

      }

      const snap =
        await db
          .ref('students')
          .orderByChild(
            'nameLower'
          )
          .equalTo(
            name.toLowerCase()
          )
          .once('value');

      let student = null;

      snap.forEach(
        (v) => {

          if (
            v.val()?.active !==
            false
          ) {

            student = {

              id:
                v.key,

              name:
                v.val().name

            };

          }

        }
      );

      if (!student) {

        return res
          .status(401)
          .json({
            error:
              'Student name is not registered or inactive'
          });

      }

      res.json({

        token:
          studentToken(
            student
          ),

        student

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Login failed'
      });

    }

  }
);


// ==================================================
// STUDENT EXAMS
// ONLY ACTIVE EXAMS
// ==================================================

app.get(
  '/api/student/exams',
  requireStudent,
  async (req, res) => {

    try {

      const exams =
        vals(
          (
            await db
              .ref('exams')
              .once('value')
          ).val()
        )
          .filter(
            (e) =>
              e.active !==
              false &&
              e.enabled !==
              false &&
              e.closed !==
              true
          )
          .sort(
            (a, b) =>
              (a.order || 0) -
              (b.order || 0)
          );

      res.json(
        exams.map(
          (e) => ({

            id:
              e.id,

            title:
              e.title,

            duration:
              e.duration || 30,

            passMark:
              e.passMark ?? 40,

            totalQuestions:
              e.totalQuestions ||
              0,

            order:
              e.order || 0,

            active:
              e.active !== false

          })
        )
      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load examinations'
      });

    }

  }
);


// ==================================================
// STUDENT EXAM QUESTIONS
// CORRECT ANSWERS HIDDEN
// ==================================================

app.get(
  '/api/student/exam/:id',
  requireStudent,
  async (req, res) => {

    try {

      const exam =
        (
          await db
            .ref(
              `exams/${req.params.id}`
            )
            .once('value')
        ).val();

      if (
        !exam ||
        exam.active === false ||
        exam.enabled === false ||
        exam.closed === true
      ) {

        return res
          .status(404)
          .json({
            error:
              'Exam is not active'
          });

      }

      const questions =
        vals(
          (
            await db
              .ref('questions')
              .orderByChild(
                'examId'
              )
              .equalTo(
                req.params.id
              )
              .once('value')
          ).val()
        )
          .sort(
            (a, b) =>
              (a.order || 0) -
              (b.order || 0)
          );

      res.json({

        exam: {

          id:
            req.params.id,

          title:
            exam.title,

          duration:
            exam.duration ||
            30,

          passMark:
            exam.passMark ??
            40,

          totalQuestions:
            questions.length

        },

        questions:

          questions.map(
            (q) => {

              const type =
                q.type ||
                'tf';

              const keys =
                type === 'mcq'
                  ? [
                      'A',
                      'B',
                      'C',
                      'D'
                    ]
                  : [
                      'A',
                      'B',
                      'C',
                      'D',
                      'E'
                    ];

              return {

                id:
                  q.id,

                type,

                question:
                  q.question,

                imageUrl:
                  q.imageUrl ||
                  '',

                order:
                  q.order ||
                  0,

                options:
                  Object.fromEntries(
                    keys.map(
                      (k) => [
                        k,
                        {
                          text:
                            q.options
                              ?.[k]
                              ?.text ||
                            ''
                        }
                      ]
                    )
                  )

              };

            }
          )

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load exam'
      });

    }

  }
);


// ==================================================
// STUDENT SUBMIT
// ==================================================

app.post(
  '/api/student/submit',
  requireStudent,
  async (req, res) => {

    try {

      const {
        examId,
        answers
      } =
        req.body || {};

      const exam =
        (
          await db
            .ref(
              `exams/${examId}`
            )
            .once('value')
        ).val();

      if (!exam) {

        return res
          .status(404)
          .json({
            error:
              'Exam not found'
          });

      }

      if (
        exam.active === false ||
        exam.enabled === false ||
        exam.closed === true
      ) {

        return res
          .status(403)
          .json({
            error:
              'This examination is closed'
          });

      }

      const questions =
        vals(
          (
            await db
              .ref('questions')
              .orderByChild(
                'examId'
              )
              .equalTo(
                examId
              )
              .once('value')
          ).val()
        )
          .sort(
            (a, b) =>
              (a.order || 0) -
              (b.order || 0)
          );

      let score = 0;

      const review =
        questions.map(
          (q, index) => {

            const given =
              answers?.[q.id];

            const type =
              q.type ||
              'tf';

            if (
              type === 'mcq'
            ) {

              const selected =
                clean(
                  given
                ).toUpperCase();

              const correct =
                Object.keys(
                  q.options ||
                  {}
                ).find(
                  (key) =>
                    q.options
                      ?.[key]
                      ?.correct ===
                    true
                ) || '';

              const isCorrect =
                selected ===
                correct;

              if (
                isCorrect
              ) {
                score++;
              }

              return {

                number:
                  index + 1,

                type:
                  'mcq',

                question:
                  q.question,

                options:
                  Object.fromEntries(
                    [
                      'A',
                      'B',
                      'C',
                      'D'
                    ].map(
                      (k) => {

                        const o =
                          q.options
                            ?.[k] ||
                          {};

                        return [
                          k,
                          {

                            text:
                              o.text ||
                              '',

                            selected:
                              selected ===
                              k,

                            correct:
                              !!o.correct

                          }
                        ];

                      }
                    )
                  ),

                isCorrect

              };

            }

            const givenTF =
              given || {};

            const correct = {};

            let allCorrect =
              true;

            for (
              const k of [
                'A',
                'B',
                'C',
                'D',
                'E'
              ]
            ) {

              correct[k] =
                !!q.options
                  ?.[k]
                  ?.correct;

              if (
                Boolean(
                  givenTF[k]
                ) !==
                correct[k]
              ) {

                allCorrect =
                  false;

              }

            }

            if (
              allCorrect
            ) {
              score++;
            }

            return {

              number:
                index + 1,

              type:
                'tf',

              question:
                q.question,

              options:
                Object.fromEntries(
                  [
                    'A',
                    'B',
                    'C',
                    'D',
                    'E'
                  ].map(
                    (k) => [

                      k,

                      {

                        text:
                          q.options
                            ?.[k]
                            ?.text ||
                          '',

                        selected:
                          Boolean(
                            givenTF[k]
                          ),

                        correct:
                          correct[k]

                      }

                    ]
                  )
                ),

              isCorrect:
                allCorrect

            };

          }
        );

      const total =
        questions.length;

      const percentage =
        total
          ? Math.round(
              (
                score /
                total
              ) *
              10000
            ) / 100
          : 0;

      const grade =
        percentage >= 80
          ? 'A+'
          : percentage >= 70
          ? 'A'
          : percentage >= 60
          ? 'A-'
          : percentage >= 50
          ? 'B'
          : percentage >= 40
          ? 'C'
          : 'F';

      const passMark =
        exam.passMark ??
        40;

      const status =
        percentage >=
        passMark
          ? 'PASS'
          : 'FAIL';

      const submissionId =
        db
          .ref(
            'submissions'
          )
          .push()
          .key;

      const resultId =
        db
          .ref(
            'results'
          )
          .push()
          .key;

      const base = {

        studentId:
          req.student
            .studentId,

        studentName:
          req.student.name,

        examId,

        examTitle:
          exam.title,

        score,

        total,

        percentage,

        grade,

        passMark,

        status,

        submittedAt:
          now(),

        review

      };

      await db
        .ref(
          `submissions/${submissionId}`
        )
        .set({

          ...base,

          answers

        });

      await db
        .ref(
          `results/${resultId}`
        )
        .set(base);

      // ==================================================
      // RANK
      // ==================================================

      const all =
        vals(
          (
            await db
              .ref('results')
              .orderByChild(
                'examId'
              )
              .equalTo(
                examId
              )
              .once('value')
          ).val()
        )
          .sort(
            (a, b) =>
              b.score -
                a.score ||
              a.submittedAt -
                b.submittedAt
          );

      const rank =
        all.findIndex(
          (r) =>
            r.id ===
            resultId
        ) + 1;

      const totalExaminees =
        all.length;

      await db
        .ref(
          `results/${resultId}/rank`
        )
        .set(rank);

      // ==================================================
      // ADMIN NOTIFICATION
      // ==================================================

      const notificationId =
        db
          .ref(
            'notifications/admins'
          )
          .push()
          .key;

      await db
        .ref(
          `notifications/admins/${notificationId}`
        )
        .set({

          type:
            'submission',

          title:
            'New Exam Submission',

          body:
            `${req.student.name} submitted ${exam.title}: ${score}/${total} (${grade})`,

          studentName:
            req.student.name,

          examId,

          examTitle:
            exam.title,

          score,

          total,

          grade,

          status,

          rank,

          resultId,

          createdAt:
            now(),

          read:
            false

        });

      await pushAdmin(

        'New Exam Submission',

        `${req.student.name} submitted ${exam.title}: ${score}/${total} (${grade})`,

        {

          type:
            'result',

          resultId,

          examId

        }

      );

      res.json({

        resultId,

        score,

        total,

        percentage,

        grade,

        status,

        passMark,

        rank,

        totalExaminees,

        review

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Submit failed'
      });

    }

  }
);


// ==================================================
// STUDENT RESULT
// ==================================================

app.get(
  '/api/student/result/:id',
  requireStudent,
  async (req, res) => {

    try {

      const result =
        (
          await db
            .ref(
              `results/${req.params.id}`
            )
            .once('value')
        ).val();

      if (
        !result ||
        result.studentId !==
        req.student.studentId
      ) {

        return res
          .status(404)
          .json({
            error:
              'Result not found'
          });

      }

      const all =
        vals(
          (
            await db
              .ref('results')
              .orderByChild(
                'examId'
              )
              .equalTo(
                result.examId
              )
              .once('value')
          ).val()
        )
          .sort(
            (a, b) =>
              b.score -
                a.score ||
              a.submittedAt -
                b.submittedAt
          );

      const rank =
        all.findIndex(
          (x) =>
            x.id ===
            req.params.id
        ) + 1;

      res.json({

        ...result,

        rank,

        totalExaminees:
          all.length

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load result'
      });

    }

  }
);


// ==================================================
// STUDENT NOTIFICATIONS
// ==================================================

app.get(
  '/api/student/notifications',
  requireStudent,
  async (req, res) => {

    try {

      const x =
        (
          await db
            .ref(
              `notifications/students/${req.student.studentId}`
            )
            .once('value')
        ).val() || {};

      res.json(
        vals(x)
          .sort(
            (a, b) =>
              (b.createdAt || 0) -
              (a.createdAt || 0)
          )
      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load notifications'
      });

    }

  }
);


// ==================================================
// STUDENT FCM TOKEN
// ==================================================

app.post(
  '/api/student/fcm-token',
  requireStudent,
  async (req, res) => {

    try {

      const token =
        clean(
          req.body.token
        );

      if (token) {

        await db
          .ref(
            `students/${req.student.studentId}/fcmTokens`
          )
          .push(token);

      }

      res.json({
        ok: true
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to save FCM token'
      });

    }

  }
);


// ==================================================
// ADMIN STATS
// ==================================================

app.get(
  '/api/admin/stats',
  requireAdmin,
  async (req, res) => {

    try {

      const [
        students,
        exams,
        results
      ] =
        await Promise.all([

          db
            .ref('students')
            .once('value'),

          db
            .ref('exams')
            .once('value'),

          db
            .ref('results')
            .once('value')

        ]);

      res.json({

        students:
          students.numChildren(),

        exams:
          exams.numChildren(),

        results:
          results.numChildren()

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load statistics'
      });

    }

  }
);


// ==================================================
// ADMIN SETTINGS
// ==================================================

app.get(
  '/api/admin/settings',
  requireAdmin,
  async (req, res) => {

    try {

      res.json(

        (
          await db
            .ref('settings')
            .once('value')
        ).val() || {}

      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load settings'
      });

    }

  }
);


app.put(
  '/api/admin/settings',
  requireAdmin,
  async (req, res) => {

    try {

      const allowed = [

        'siteName',

        'headerTitle',

        'subtitle',

        'logoUrl',

        'backgroundUrl',

        'notice',

        'footerText',

        'commonExamPin',

        'passMarkDefault',

        'headerColor'

      ];

      const out = {};

      for (
        const key
        of allowed
      ) {

        if (
          req.body?.[key] !==
          undefined
        ) {

          out[key] =
            req.body[key];

        }

      }

      await db
        .ref('settings')
        .update(out);

      res.json({
        ok: true
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to save settings'
      });

    }

  }
);


// ==================================================
// ADMIN STUDENTS
// ==================================================

app.get(
  '/api/admin/students',
  requireAdmin,
  async (req, res) => {

    try {

      res.json(

        vals(

          (
            await db
              .ref('students')
              .once('value')
          ).val()

        )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          )

      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load students'
      });

    }

  }
);


app.post(
  '/api/admin/students',
  requireAdmin,
  async (req, res) => {

    try {

      const name =
        clean(
          req.body.name
        );

      if (!name) {

        return res
          .status(400)
          .json({
            error:
              'Name required'
          });

      }

      const id =
        req.body.id ||
        db
          .ref('students')
          .push()
          .key;

      await db
        .ref(
          `students/${id}`
        )
        .update({

          name,

          nameLower:
            name.toLowerCase(),

          active:
            req.body.active !==
            false

        });

      res.json({
        id
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to save student'
      });

    }

  }
);


app.delete(
  '/api/admin/students/:id',
  requireAdmin,
  async (req, res) => {

    try {

      await db
        .ref(
          `students/${req.params.id}`
        )
        .remove();

      res.json({
        ok: true
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to delete student'
      });

    }

  }
);


// ==================================================
// ADMIN EXAMS
// ==================================================

app.get(
  '/api/admin/exams',
  requireAdmin,
  async (req, res) => {

    try {

      res.json(

        vals(

          (
            await db
              .ref('exams')
              .once('value')
          ).val()

        )
          .sort(
            (a, b) =>
              (a.order || 0) -
              (b.order || 0)
          )

      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load examinations'
      });

    }

  }
);


// ==================================================
// CREATE EXAM
// ==================================================

app.post(
  '/api/admin/exams',
  requireAdmin,
  async (req, res) => {

    try {

      const b =
        req.body || {};

      const id =
        b.id ||
        db
          .ref('exams')
          .push()
          .key;

      await db
        .ref(
          `exams/${id}`
        )
        .set({

          title:
            clean(
              b.title
            ),

          duration:
            Number(
              b.duration
            ) || 30,

          passMark:
            Number(
              b.passMark ??
              40
            ),

          active:
            b.active !== false,

          enabled:
            b.enabled !== false,

          closed:
            b.closed === true,

          order:
            Number(
              b.order
            ) || 0,

          totalQuestions:
            Number(
              b.totalQuestions
            ) || 0

        });

      res.json({
        id
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to create examination'
      });

    }

  }
);


// ==================================================
// UPDATE EXAM
// ==================================================

app.put(
  '/api/admin/exams/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        req.params.id;

      const snap =
        await db
          .ref(
            `exams/${id}`
          )
          .once('value');

      if (!snap.exists()) {

        return res
          .status(404)
          .json({
            error:
              'Examination not found'
          });

      }

      const b =
        req.body || {};

      const update = {};

      if (
        b.title !==
        undefined
      ) {

        update.title =
          clean(
            b.title
          );

      }

      if (
        b.duration !==
        undefined
      ) {

        update.duration =
          Number(
            b.duration
          ) || 30;

      }

      if (
        b.passMark !==
        undefined
      ) {

        update.passMark =
          Number(
            b.passMark
          );

      }

      if (
        b.active !==
        undefined
      ) {

        update.active =
          Boolean(
            b.active
          );

      }

      if (
        b.enabled !==
        undefined
      ) {

        update.enabled =
          Boolean(
            b.enabled
          );

      }

      if (
        b.closed !==
        undefined
      ) {

        update.closed =
          Boolean(
            b.closed
          );

      }

      if (
        b.order !==
        undefined
      ) {

        update.order =
          Number(
            b.order
          ) || 0;

      }

      if (
        b.totalQuestions !==
        undefined
      ) {

        update.totalQuestions =
          Number(
            b.totalQuestions
          ) || 0;

      }

      await db
        .ref(
          `exams/${id}`
        )
        .update(update);

      res.json({
        ok: true,
        id
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to update examination'
      });

    }

  }
);


// ==================================================
// OPEN / CLOSE EXAM
// ==================================================

app.put(
  '/api/admin/exams/:id/status',
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        req.params.id;

      const snap =
        await db
          .ref(
            `exams/${id}`
          )
          .once('value');

      if (!snap.exists()) {

        return res
          .status(404)
          .json({
            error:
              'Examination not found'
          });

      }

      const active =
        Boolean(
          req.body?.active
        );

      await db
        .ref(
          `exams/${id}`
        )
        .update({

          active,

          enabled:
            active,

          closed:
            !active

        });

      res.json({

        ok: true,

        id,

        active

      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to update examination status'
      });

    }

  }
);


// ==================================================
// DELETE EXAM
// ALSO DELETE QUESTIONS
// ==================================================

app.delete(
  '/api/admin/exams/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const examId =
        req.params.id;

      await db
        .ref(
          `exams/${examId}`
        )
        .remove();

      const questions =
        (
          await db
            .ref('questions')
            .orderByChild(
              'examId'
            )
            .equalTo(
              examId
            )
            .once('value')
        ).val() || {};

      await Promise.all(

        Object.keys(
          questions
        ).map(
          (id) =>
            db
              .ref(
                `questions/${id}`
              )
              .remove()
        )

      );

      res.json({
        ok: true
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to delete examination'
      });

    }

  }
);


// ==================================================
// ADMIN QUESTIONS
// ==================================================

app.get(
  '/api/admin/questions/:examId',
  requireAdmin,
  async (req, res) => {

    try {

      const questions =
        (
          await db
            .ref('questions')
            .orderByChild(
              'examId'
            )
            .equalTo(
              req.params.examId
            )
            .once('value')
        ).val();

      res.json(

        vals(questions)
          .sort(
            (a, b) =>
              (a.order || 0) -
              (b.order || 0)
          )

      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load questions'
      });

    }

  }
);


// ==================================================
// ADD / UPDATE QUESTION
// ==================================================

app.post(
  '/api/admin/questions',
  requireAdmin,
  async (req, res) => {

    try {

      const b =
        req.body || {};

      const id =
        b.id ||
        db
          .ref('questions')
          .push()
          .key;

      const type =
        b.type === 'mcq'
          ? 'mcq'
          : 'tf';

      const keys =
        type === 'mcq'
          ? [
              'A',
              'B',
              'C',
              'D'
            ]
          : [
              'A',
              'B',
              'C',
              'D',
              'E'
            ];

      const options = {};

      for (
        const k of keys
      ) {

        options[k] = {

          text:
            clean(
              b.options?.[
                k
              ]?.text
            ),

          correct:
            Boolean(
              b.options?.[
                k
              ]?.correct
            )

        };

      }

      await db
        .ref(
          `questions/${id}`
        )
        .set({

          examId:
            b.examId,

          type,

          question:
            clean(
              b.question
            ),

          imageUrl:
            clean(
              b.imageUrl
            ),

          order:
            Number(
              b.order
            ) || 0,

          mark:
            Number(
              b.mark
            ) || 1,

          options

        });

      const snap =
        await db
          .ref(
            `questions`
          )
          .orderByChild(
            'examId'
          )
          .equalTo(
            b.examId
          )
          .once('value');

      await db
        .ref(
          `exams/${b.examId}/totalQuestions`
        )
        .set(
          snap.numChildren()
        );

      res.json({
        id
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to save question'
      });

    }

  }
);


// ==================================================
// DELETE QUESTION
// ==================================================

app.delete(
  '/api/admin/questions/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const questionId =
        req.params.id;

      const snap =
        await db
          .ref(
            `questions/${questionId}`
          )
          .once('value');

      const question =
        snap.val();

      await db
        .ref(
          `questions/${questionId}`
        )
        .remove();

      if (
        question?.examId
      ) {

        const qs =
          await db
            .ref('questions')
            .orderByChild(
              'examId'
            )
            .equalTo(
              question.examId
            )
            .once('value');

        await db
          .ref(
            `exams/${question.examId}/totalQuestions`
          )
          .set(
            qs.numChildren()
          );

      }

      res.json({
        ok: true
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to delete question'
      });

    }

  }
);


// ==================================================
// ADMIN RESULTS
// ==================================================

app.get(
  '/api/admin/results',
  requireAdmin,
  async (req, res) => {

    try {

      const results =
        vals(

          (
            await db
              .ref('results')
              .once('value')
          ).val()

        )
          .sort(
            (a, b) =>
              (
                b.submittedAt ||
                0
              ) -
              (
                a.submittedAt ||
                0
              )
          );

      res.json(

        results.map(
          (r) => ({

            ...r,

            review:
              undefined

          })
        )

      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load results'
      });

    }

  }
);


// ==================================================
// VIEW SINGLE RESULT
// ==================================================

app.get(
  '/api/admin/results/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        (
          await db
            .ref(
              `results/${req.params.id}`
            )
            .once('value')
        ).val();

      if (!result) {

        return res
          .status(404)
          .json({
            error:
              'Not found'
          });

      }

      res.json(result);

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load result'
      });

    }

  }
);


// ==================================================
// DELETE RESULT / HISTORY
// ==================================================

app.delete(
  '/api/admin/results/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const resultId =
        req.params.id;

      const resultSnap =
        await db
          .ref(
            `results/${resultId}`
          )
          .once('value');

      const result =
        resultSnap.val();

      if (!result) {

        return res
          .status(404)
          .json({
            error:
              'Result not found'
          });

      }

      await db
        .ref(
          `results/${resultId}`
        )
        .remove();

      const submissionsSnap =
        await db
          .ref('submissions')
          .orderByChild(
            'studentId'
          )
          .equalTo(
            result.studentId
          )
          .once('value');

      const submissions =
        submissionsSnap.val() ||
        {};

      const updates = {};

      for (
        const [
          id,
          submission
        ]
        of Object.entries(
          submissions
        )
      ) {

        if (

          submission?.examId ===
          result.examId &&

          submission?.submittedAt ===
          result.submittedAt

        ) {

          updates[
            `submissions/${id}`
          ] = null;

        }

      }

      if (
        Object.keys(
          updates
        ).length
      ) {

        await db
          .ref()
          .update(
            updates
          );

      }

      const notificationsSnap =
        await db
          .ref(
            'notifications/admins'
          )
          .once('value');

      const notifications =
        notificationsSnap.val() ||
        {};

      const notificationUpdates = {};

      for (
        const [
          id,
          notification
        ]
        of Object.entries(
          notifications
        )
      ) {

        if (
          notification?.resultId ===
          resultId
        ) {

          notificationUpdates[
            `notifications/admins/${id}`
          ] = null;

        }

      }

      if (
        Object.keys(
          notificationUpdates
        ).length
      ) {

        await db
          .ref()
          .update(
            notificationUpdates
          );

      }

      res.json({
        ok: true,
        message:
          'Result deleted successfully'
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to delete result'
      });

    }

  }
);


// ==================================================
// ADMIN NOTIFICATIONS
// ==================================================

app.get(
  '/api/admin/notifications',
  requireAdmin,
  async (req, res) => {

    try {

      const x =
        (
          await db
            .ref(
              'notifications/admins'
            )
            .once('value')
        ).val() || {};

      res.json(

        vals(x)
          .sort(
            (a, b) =>
              (
                b.createdAt ||
                0
              ) -
              (
                a.createdAt ||
                0
              )
          )

      );

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to load notifications'
      });

    }

  }
);


// ==================================================
// ADMIN FCM TOKEN
// ==================================================

app.post(
  '/api/admin/fcm-token',
  requireAdmin,
  async (req, res) => {

    try {

      const token =
        clean(
          req.body.token
        );

      if (token) {

        await db
          .ref(
            `admins/${ADMIN_UID}/fcmTokens`
          )
          .push(token);

      }

      res.json({
        ok: true
      });

    }
    catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Failed to save FCM token'
      });

    }

  }
);


// ==================================================
// FRONTEND FILES
// ==================================================

const frontendFiles = [

  '/',

  '/index.html',

  '/admin.html',

  '/exam.html',

  '/result.html',

  '/style.css',

  '/app.js',

  '/admin.js',

  '/exam.js',

  '/result.js',

  '/firebase-config.js',

  '/firebase-messaging-sw.js'

];

app.get(
  frontendFiles,
  (req, res) => {

    const file =
      req.path === '/'
        ? 'index.html'
        : req.path.substring(1);

    res.sendFile(
      path.join(
        ROOT,
        file
      )
    );

  }
);


// ==================================================
// UNKNOWN API
// ==================================================

app.use(
  (req, res, next) => {

    if (
      req.path.startsWith(
        '/api/'
      )
    ) {

      return res
        .status(404)
        .json({
          error:
            'API endpoint not found'
        });

    }

    next();

  }
);


// ==================================================
// ERROR HANDLER
// ==================================================

app.use(
  (err, req, res, next) => {

    console.error(
      'SERVER ERROR:',
      err
    );

    res.status(500).json({
      error:
        'Internal server error'
    });

  }
);


// ==================================================
// SERVER START
// ==================================================

const port =
  process.env.PORT ||
  10000;

app.listen(
  port,
  () => {

    console.log(
      `SEVEN NURSES running on ${port}`
    );

  }
);
