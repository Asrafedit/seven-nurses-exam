const express = require('express');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

app.use(express.json({ limit: '2mb' }));

// ==================================================
// Firebase Admin
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
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const messaging = admin.messaging();

const SECRET =
  process.env.SESSION_SECRET || 'change-me';

const ADMIN_UID =
  process.env.ADMIN_UID || '';

const ROOT = __dirname;

// ==================================================
// Helpers
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
// Student Token
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
// Student Authentication
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

    req.student = decoded;

    next();

  } catch (e) {

    res.status(401).json({
      error:
        'Student login required'
    });

  }
}

// ==================================================
// Admin Authentication
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
        .verifyIdToken(token);

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

    req.admin = decoded;

    next();

  } catch (e) {

    res.status(401).json({
      error:
        'Admin login required'
    });

  }

}

// ==================================================
// Admin FCM Tokens
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
// Push Notification
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

  } catch (e) {

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

        passMarkDefault:
          s.passMarkDefault ??
          40

      });

    } catch (e) {

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
        clean(req.body.name);

      const pin =
        clean(req.body.pin);

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

      snap.forEach((v) => {

        if (
          v.val()?.active !==
          false
        ) {

          student = {

            id: v.key,

            name:
              v.val().name

          };

        }

      });

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
          studentToken(student),

        student

      });

    } catch (e) {

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
            e =>
              e.active !==
              false
          )
          .sort(
            (a, b) =>
              (a.order || 0) -
              (b.order || 0)
          );

      res.json(
        exams.map(
          e => ({

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
              e.order || 0

          })
        )
      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Exam loading failed'
      });

    }

  }
);

// ==================================================
// STUDENT EXAM QUESTIONS
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
        exam.active ===
          false
      ) {

        return res
          .status(404)
          .json({
            error:
              'Exam not found'
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
        ).sort(
          (a, b) =>
            (a.order || 0) -
            (b.order || 0)
        );

      const safeQuestions =
        questions.map(
          q => {

            const type =
              q.type ||
              'tf';

            // ------------------------------------------
            // Multiple Choice
            // ------------------------------------------

            if (
              type === 'mcq'
            ) {

              return {

                id:
                  q.id,

                type:
                  'mcq',

                question:
                  q.question,

                imageUrl:
                  q.imageUrl ||
                  '',

                order:
                  q.order || 0,

                options:
                  Object.fromEntries(

                    [
                      'A',
                      'B',
                      'C',
                      'D',
                      'E'
                    ].map(
                      k => [

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

            // ------------------------------------------
            // True / False
            // ------------------------------------------

            return {

              id:
                q.id,

              type:
                'tf',

              question:
                q.question,

              imageUrl:
                q.imageUrl ||
                '',

              order:
                q.order || 0,

              options:
                Object.fromEntries(

                  [
                    'A',
                    'B',
                    'C',
                    'D',
                    'E'
                  ].map(
                    k => [

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
          safeQuestions

      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Question loading failed'
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
      } = req.body || {};

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

      const questions =
        vals(
          (
            await db
              .ref('questions')
              .orderByChild(
                'examId'
              )
              .equalTo(examId)
              .once('value')
          ).val()
        ).sort(
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

            let isCorrect =
              false;

            // ==========================================
            // MCQ CHECK
            // ==========================================

            if (
              type === 'mcq'
            ) {

              const correctAnswer =
                Object.keys(
                  q.options || {}
                ).find(
                  key =>
                    q.options?.[key]
                      ?.correct === true
                );

              const selectedAnswer =
                typeof given ===
                'string'
                  ? given
                  : given?.selected;

              isCorrect =
                Boolean(
                  selectedAnswer
                ) &&
                selectedAnswer ===
                  correctAnswer;

              if (isCorrect) {
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
                      'D',
                      'E'
                    ].map(
                      k => {

                        const o =
                          q.options?.[k] ||
                          {};

                        return [

                          k,

                          {

                            text:
                              o.text ||
                              '',

                            selected:
                              selectedAnswer ===
                              k,

                            correct:
                              o.correct ===
                              true

                          }

                        ];

                      }
                    )

                  ),

                selectedAnswer:
                  selectedAnswer ||
                  '',

                correctAnswer:
                  correctAnswer ||
                  '',

                isCorrect

              };

            }

            // ==========================================
            // TRUE / FALSE CHECK
            // ==========================================

            const givenTF =
              given || {};

            let allCorrect =
              true;

            const correct = {};

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

            if (allCorrect) {
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
                    k => [

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

      // ==========================================
      // IDs
      // ==========================================

      const submissionId =
        db
          .ref('submissions')
          .push()
          .key;

      const resultId =
        db
          .ref('results')
          .push()
          .key;

      // ==========================================
      // Result Base
      // ==========================================

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

      // ==========================================
      // Save Submission
      // ==========================================

      await db
        .ref(
          `submissions/${submissionId}`
        )
        .set({

          ...base,

          answers

        });

      // ==========================================
      // Save Result
      // ==========================================

      await db
        .ref(
          `results/${resultId}`
        )
        .set(base);

      // ==========================================
      // Rank
      // ==========================================

      const all =
        vals(
          (
            await db
              .ref('results')
              .orderByChild(
                'examId'
              )
              .equalTo(examId)
              .once('value')
          ).val()
        ).sort(
          (a, b) =>
            b.score -
              a.score ||
            a.submittedAt -
              b.submittedAt
        );

      const rank =
        all.findIndex(
          r =>
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

      // ==========================================
      // Admin Notification
      // ==========================================

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

      // ==========================================
      // Push Admin Notification
      // ==========================================

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

    } catch (e) {

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
        ).sort(
          (a, b) =>
            b.score -
              a.score ||
            a.submittedAt -
              b.submittedAt
        );

      const rank =
        all.findIndex(
          x =>
            x.id ===
            req.params.id
        ) + 1;

      res.json({

        ...result,

        rank,

        totalExaminees:
          all.length

      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Result loading failed'
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

        vals(x).sort(
          (a, b) =>
            (b.createdAt || 0) -
            (a.createdAt || 0)
        )

      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Notification loading failed'
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'FCM token save failed'
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Stats failed'
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Settings loading failed'
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

        'passMarkDefault'

      ];

      const out = {};

      for (
        const key of allowed
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Settings save failed'
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
        ).sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        )

      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Students loading failed'
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Student save failed'
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Student delete failed'
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
        ).sort(
          (a, b) =>
            (a.order || 0) -
            (b.order || 0)
        )

      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Exams loading failed'
      });

    }

  }
);

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
            clean(b.title),

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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Exam save failed'
      });

    }

  }
);

app.delete(
  '/api/admin/exams/:id',
  requireAdmin,
  async (req, res) => {

    try {

      await db
        .ref(
          `exams/${req.params.id}`
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
              req.params.id
            )
            .once('value')
        ).val() || {};

      await Promise.all(

        Object.keys(
          questions
        ).map(
          id =>
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Exam delete failed'
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

        vals(questions).sort(
          (a, b) =>
            (a.order || 0) -
            (b.order || 0)
        )

      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Questions loading failed'
      });

    }

  }
);

// ==================================================
// ADMIN ADD QUESTION
// Supports:
// 1. tf
// 2. mcq
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

      const options = {};

      for (
        const k of [
          'A',
          'B',
          'C',
          'D',
          'E'
        ]
      ) {

        options[k] = {

          text:
            clean(
              b.options?.[k]?.text
            ),

          correct:
            Boolean(
              b.options?.[k]?.correct
            )

        };

      }

      // ------------------------------------------
      // MCQ validation
      // ------------------------------------------

      if (
        type === 'mcq'
      ) {

        const correctCount =
          Object.values(
            options
          ).filter(
            x =>
              x.correct ===
              true
          ).length;

        if (
          correctCount !== 1
        ) {

          return res
            .status(400)
            .json({

              error:
                'MCQ must have exactly one correct option'

            });

        }

      }

      // ------------------------------------------
      // Save
      // ------------------------------------------

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

      // ------------------------------------------
      // Update exam question count
      // ------------------------------------------

      const questionSnap =
        await db
          .ref('questions')
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
          questionSnap.numChildren()
        );

      res.json({
        id
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({

        error:
          'Question save failed'

      });

    }

  }
);

// ==================================================
// ADMIN DELETE QUESTION
// ==================================================

app.delete(
  '/api/admin/questions/:id',
  requireAdmin,
  async (req, res) => {

    try {

      const question =
        (
          await db
            .ref(
              `questions/${req.params.id}`
            )
            .once('value')
        ).val();

      if (!question) {

        return res
          .status(404)
          .json({
            error:
              'Question not found'
          });

      }

      await db
        .ref(
          `questions/${req.params.id}`
        )
        .remove();

      // Update question count

      const questionSnap =
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
          questionSnap.numChildren()
        );

      res.json({
        ok: true
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({

        error:
          'Question delete failed'

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
        ).sort(
          (a, b) =>
            (b.submittedAt ||
              0) -
            (a.submittedAt ||
              0)
        );

      res.json(

        results.map(
          r => ({

            ...r,

            review:
              undefined

          })
        )

      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Results loading failed'
      });

    }

  }
);

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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Result loading failed'
      });

    }

  }
);

// ==================================================
// ADMIN NOTIFICATIONS
// Existing notification system kept
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

        vals(x).sort(
          (a, b) =>
            (b.createdAt ||
              0) -
            (a.createdAt ||
              0)
        )

      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'Notifications loading failed'
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

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          'FCM token save failed'
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
// Unknown API
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
