let boot = null;
let exams = [];
let questions = [];
let answers = {};
let currentExam = null;
let student = null;
let timerId = null;
let secondsLeft = 0;
let submitted = false;

const $ = id => document.getElementById(id);

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function toast(msg) {

  const el = $("toast");

  if (!el) {
    alert(msg);
    return;
  }

  el.textContent = msg;

  el.style.display = "block";

  clearTimeout(window.__toast);

  window.__toast = setTimeout(
    () => el.style.display = "none",
    2800
  );

}

async function api(path, opt = {}) {

  const token =
    localStorage.getItem("sn_student_token");

  const headers = {
    "Content-Type": "application/json",
    ...(opt.headers || {})
  };

  if (token) {
    headers.Authorization =
      "Bearer " + token;
  }

  const r = await fetch(
    path,
    {
      ...opt,
      headers
    }
  );

  const raw = await r.text();

  let data = {};

  try {

    data = JSON.parse(raw);

  }
  catch {

    data = {
      error: raw || ("HTTP " + r.status)
    };

  }

  if (!r.ok) {

    throw new Error(
      data.error ||
      data.message ||
      ("HTTP " + r.status)
    );

  }

  return data;

}

async function init() {

  try {

    boot =
      await api("/api/bootstrap");

    applyBootstrap(boot);

    await loadExams();

  }
  catch (e) {

    toast(
      "System could not be loaded: " +
      e.message
    );

    const select =
      $("examSelect");

    if (select) {

      select.innerHTML =
        '<option value="">Unable to load examinations</option>';

    }

  }

}

function applyBootstrap(s) {

  if ($("siteTitle")) {

    $("siteTitle").textContent =
      s.siteName ||
      s.headerTitle ||
      "SEVEN NURSES";

  }

  if ($("siteSub")) {

    $("siteSub").textContent =
      s.subtitle ||
      "ONLINE EXAM SYSTEM";

  }

  if ($("footer")) {

    $("footer").textContent =
      s.footerText ||
      "© SEVEN NURSES";

  }

  const notice =
    s.notice || "";

  if ($("notice")) {

    $("notice").textContent =
      notice;

    $("notice").classList.toggle(
      "hidden",
      !notice
    );

  }

  /*
   * Logo
   *
   * Clicking the logo opens the
   * configured Logo URL / file.
   */

  if (s.logoUrl && $("logo")) {

    const logo =
      $("logo");

    logo.src =
      s.logoUrl;

    logo.style.display =
      "block";

    logo.style.cursor =
      "pointer";

    logo.title =
      "Open logo link";

    logo.onclick = () => {

      window.open(
        s.logoUrl,
        "_blank",
        "noopener,noreferrer"
      );

    };

  }
  else if ($("logo")) {

    $("logo").style.display =
      "none";

  }

  if (s.backgroundUrl) {

    document.body.style.backgroundImage =
      `url("${String(
        s.backgroundUrl
      ).replace(/"/g, "&quot;")}")`;

    document.body.style.backgroundSize =
      "cover";

    document.body.style.backgroundAttachment =
      "fixed";

  }

}

async function loadExams() {

  const select =
    $("examSelect");

  if (!select) {
    return;
  }

  select.innerHTML =
    '<option value="">Login to select an examination</option>';

}

async function studentLogin() {

  const name =
    $("studentName")
      .value
      .trim();

  const pin =
    $("pin")
      .value
      .trim();

  if (!name || !pin) {

    return toast(
      "Enter your name and Exam PIN."
    );

  }

  const btn =
    $("startBtn");

  btn.disabled =
    true;

  btn.textContent =
    "Checking...";

  try {

    const login =
      await api(
        "/api/student/login",
        {
          method: "POST",

          body:
            JSON.stringify({
              name,
              pin
            })
        }
      );

    localStorage.setItem(
      "sn_student_token",
      login.token
    );

    localStorage.setItem(
      "sn_student",
      JSON.stringify(
        login.student || {}
      )
    );

    student =
      login.student ||
      { name };

    await loadStudentExams();

  }
  catch (e) {

    toast(
      e.message
    );

    btn.disabled =
      false;

    btn.textContent =
      "Start Examination";

  }

}

async function loadStudentExams() {

  try {

    exams =
      await api(
        "/api/student/exams"
      );

    if (!Array.isArray(exams)) {

      exams = [];

    }

    const select =
      $("examSelect");

    if (!select) {
      return;
    }

    select.innerHTML =
      exams.length
        ?
        exams.map(
          e =>
            `<option value="${esc(e.id)}">
              ${esc(e.title)} — ${esc(e.duration)} min
            </option>`
        ).join("")
        :
        '<option value="">No Active Examination</option>';

    const id =
      select.value;

    if (!id) {

      return toast(
        "No Active Examination found."
      );

    }

    await startExam(id);

  }
  catch (e) {

    toast(
      e.message
    );

    if ($("startBtn")) {

      $("startBtn").disabled =
        false;

      $("startBtn").textContent =
        "Start Examination";

    }

  }

}

async function startExam(id) {

  const data =
    await api(
      "/api/student/exam/" +
      encodeURIComponent(id)
    );

  currentExam =
    data.exam ||
    exams.find(
      x => x.id === id
    ) ||
    {
      id,
      title: id,
      duration: 30
    };

  questions =
    Array.isArray(data.questions)
      ?
      data.questions
      :
      [];

  answers = {};

  submitted = false;

  if (!questions.length) {

    return toast(
      "There are no questions in this examination."
    );

  }

  $("login")
    .classList
    .add("hidden");

  $("exam")
    .classList
    .remove("hidden");

  $("result")
    .classList
    .add("hidden");

  $("examName").textContent =
    currentExam.title ||
    "Examination";

  $("questionCounter").textContent =
    `${questions.length} Questions`;

  renderQuestions();

  const duration =
    Number(
      currentExam.duration || 30
    );

  startTimer(
    Math.max(1, duration) * 60
  );

}

function renderQuestions() {

  $("questions").innerHTML =
    questions.map(
      (q, i) => {

        const opts =
          q.options || {};

        /*
         * New MCQ question
         */

        if (
          String(q.type || "")
            .toLowerCase() === "mcq"
        ) {

          return renderMCQ(
            q,
            i,
            opts
          );

        }

        /*
         * Existing True / False question
         */

        return renderTrueFalse(
          q,
          i,
          opts
        );

      }
    )
    .join("");

}

function renderMCQ(q, i, opts) {

  const optionKeys =
    ["A", "B", "C", "D"];

  return `

    <div class="question-box">

      <div class="question-heading">
        Q${i + 1}. ${esc(q.question || "")}
      </div>

      ${
        q.imageUrl
          ?
          `<img
            class="question-image"
            src="${esc(q.imageUrl)}"
            alt="Question image"
          >`
          :
          ""
      }

      <div class="mcq-options">

        ${
          optionKeys
            .map(k => {

              const text =
                opts[k]?.text || "";

              return `

                <label
                  class="mcq-option"
                  style="
                    display:block;
                    cursor:pointer;
                    margin:10px 0;
                  "
                >

                  <input
                    type="radio"
                    name="q_${esc(q.id)}"
                    value="${k}"
                    onchange="
                      setMCQAnswer(
                        '${esc(q.id)}',
                        '${k}'
                      )
                    "
                  >

                  <span>
                    <b>${k}.</b>
                    ${esc(text)}
                  </span>

                </label>

              `;

            })
            .join("")
        }

      </div>

    </div>

  `;

}

function renderTrueFalse(q, i, opts) {

  return `

    <div class="question-box">

      <div class="question-heading">
        Q${i + 1}. ${esc(q.question || "")}
      </div>

      ${
        q.imageUrl
          ?
          `<img
            class="question-image"
            src="${esc(q.imageUrl)}"
            alt="Question image"
          >`
          :
          ""
      }

      ${
        ["A", "B", "C", "D", "E"]
          .map(k => {

            const text =
              opts[k]?.text || "";

            return `

              <div class="statement">

                <div class="statement-text">

                  <b>${k}.</b>
                  ${esc(text)}

                </div>

                <div class="tf-row">

                  <label
                    class="tf-label"
                  >

                    <input
                      type="radio"
                      name="q_${esc(q.id)}_${k}"
                      onchange="
                        setAnswer(
                          '${esc(q.id)}',
                          '${k}',
                          true
                        )
                      "
                    >

                    <span class="true-choice">
                      TRUE
                    </span>

                  </label>

                  <label
                    class="tf-label"
                  >

                    <input
                      type="radio"
                      name="q_${esc(q.id)}_${k}"
                      onchange="
                        setAnswer(
                          '${esc(q.id)}',
                          '${k}',
                          false
                        )
                      "
                    >

                    <span class="false-choice">
                      FALSE
                    </span>

                  </label>

                </div>

              </div>

            `;

          })
          .join("")
      }

    </div>

  `;

}

function setAnswer(
  qid,
  key,
  value
) {

  if (!answers[qid]) {

    answers[qid] = {};

  }

  answers[qid][key] =
    value;

}

function setMCQAnswer(
  qid,
  value
) {

  answers[qid] =
    value;

}

function startTimer(totalSeconds) {

  clearInterval(
    timerId
  );

  secondsLeft =
    totalSeconds;

  paintTimer();

  timerId =
    setInterval(
      () => {

        secondsLeft--;

        paintTimer();

        if (
          secondsLeft <= 0
        ) {

          clearInterval(
            timerId
          );

          toast(
            "Time is over. Submitting examination..."
          );

          submitExam(true);

        }

      },
      1000
    );

}

function paintTimer() {

  const m =
    Math.floor(
      secondsLeft / 60
    );

  const s =
    secondsLeft % 60;

  $("timer").textContent =
    `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  $("timer")
    .classList
    .remove("hidden");

}

async function submitExam(
  autoSubmit
) {

  if (submitted) {

    return;

  }

  if (
    !autoSubmit &&
    !confirm(
      "Are you sure you want to submit the examination?"
    )
  ) {

    return;

  }

  submitted = true;

  clearInterval(
    timerId
  );

  try {

    const result =
      await api(
        "/api/student/submit",
        {
          method: "POST",

          body:
            JSON.stringify({
              examId:
                currentExam.id,

              answers
            })
        }
      );

    showResult(result);

  }
  catch (e) {

    submitted = false;

    toast(
      e.message
    );

  }

}

function showResult(r) {

  $("timer")
    .classList
    .add("hidden");

  $("exam")
    .classList
    .add("hidden");

  $("result")
    .classList
    .remove("hidden");

  const status =
    String(
      r.status || ""
    ).toUpperCase();

  const review =
    Array.isArray(r.review)
      ?
      r.review
      :
      [];

  $("result").innerHTML = `

    <div class="card result-card">

      <div class="section-title">
        Examination Result
      </div>

      <div class="result-score">
        ${esc(r.score)}
        /
        ${esc(r.total)}
      </div>

      <div class="${
        status === "PASS"
          ? "pass"
          : "fail"
      }">

        ${esc(status)}

      </div>

      <div class="stats">

        <div class="stat">

          <b>
            ${esc(r.percentage)}%
          </b>

          <span>
            Percentage
          </span>

        </div>

        <div class="stat">

          <b>
            ${esc(r.grade)}
          </b>

          <span>
            Grade
          </span>

        </div>

        <div class="stat">

          <b>
            ${esc(r.passMark)}
          </b>

          <span>
            Pass Mark
          </span>

        </div>

        <div class="stat">

          <b>
            ${esc(r.rank || "-")}
          </b>

          <span>
            Rank
          </span>

        </div>

        <div class="stat">

          <b>
            ${esc(
              r.totalExaminees || "-"
            )}
          </b>

          <span>
            Total Examinees
          </span>

        </div>

        <div class="stat">

          <b>
            ${esc(
              student?.name || ""
            )}
          </b>

          <span>
            Student
          </span>

        </div>

      </div>

    </div>

    <div class="card">

      <div class="review-title">
        Answer Sheet & Solutions
      </div>

      ${
        review.length
          ?
          review
            .map(renderReview)
            .join("")
          :
          `
            <div class="empty">
              No review available.
            </div>
          `
      }

    </div>

    <button
      class="btn btn-blue"
      onclick="location.href='/'"
    >
      Back to Student Login
    </button>

  `;

}

function renderReview(item) {

  const good =
    !!item.isCorrect;

  const opts =
    item.options || {};

  /*
   * MCQ review
   */

  if (
    String(item.type || "")
      .toLowerCase() === "mcq"
  ) {

    const selected =
      item.selectedAnswer ||
      item.answer ||
      "";

    const correct =
      item.correctAnswer ||
      Object.keys(opts)
        .find(
          k =>
            opts[k]?.correct === true
        ) ||
      "";

    return `

      <div class="review-item ${
        good
          ? "correct"
          : "wrong"
      }">

        <div class="review-q">

          Q${esc(item.number)}.
          ${esc(item.question)}

        </div>

        <div class="review-opt">

          ${
            ["A", "B", "C", "D"]
              .map(k => {

                const o =
                  opts[k] || {};

                const isSelected =
                  selected === k;

                const isCorrect =
                  correct === k;

                return `

                  <div>

                    <b>${k}.</b>
                    ${esc(o.text || "")}

                    ${
                      isSelected
                        ?
                        `
                          <strong>
                            — Your Answer
                          </strong>
                        `
                        :
                        ""
                    }

                    ${
                      isCorrect
                        ?
                        `
                          <span class="correct-text">
                            — Correct Answer
                          </span>
                        `
                        :
                        ""
                    }

                  </div>

                `;

              })
              .join("")
          }

        </div>

      </div>

    `;

  }

  /*
   * True / False review
   */

  return `

    <div class="review-item ${
      good
        ? "correct"
        : "wrong"
    }">

      <div class="review-q">

        Q${esc(item.number)}.
        ${esc(item.question)}

      </div>

      <div class="review-opt">

        ${
          ["A", "B", "C", "D", "E"]
            .map(k => {

              const o =
                opts[k] || {};

              const selected =
                !!o.selected;

              const correct =
                !!o.correct;

              return `

                <div>

                  <b>${k}.</b>
                  ${esc(o.text || "")}

                  —

                  Your Answer:

                  <span class="${
                    selected === correct
                      ? "correct-text"
                      : "wrong-text"
                  }">

                    ${
                      selected
                        ? "TRUE"
                        : "FALSE"
                    }

                  </span>

                  |

                  Correct:

                  <span class="correct-text">

                    ${
                      correct
                        ? "TRUE"
                        : "FALSE"
                    }

                  </span>

                </div>

              `;

            })
            .join("")
        }

      </div>

    </div>

  `;

}

window.studentLogin =
  studentLogin;

window.submitExam =
  submitExam;

window.setAnswer =
  setAnswer;

window.setMCQAnswer =
  setMCQAnswer;

init();
