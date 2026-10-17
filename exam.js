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

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.style.display = "block";

  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => {
    el.style.display = "none";
  }, 2800);
}

async function api(path, options = {}) {
  const token = localStorage.getItem("sn_student_token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const raw = await response.text();
  let data = {};

  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw || "HTTP " + response.status };
  }

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "HTTP " + response.status
    );
  }

  return data;
}

async function init() {
  try {
    boot = await api("/api/bootstrap");
    applyBootstrap(boot);
    await loadExams();

    const savedStudent = localStorage.getItem("sn_student");

    if (savedStudent) {
      try {
        student = JSON.parse(savedStudent);
      } catch {
        student = null;
      }
    }
  } catch (error) {
    toast("সিস্টেম লোড করা যায়নি: " + error.message);

    const select = $("examSelect");

    if (select) {
      select.innerHTML =
        '<option value="">পরীক্ষার তালিকা লোড হয়নি</option>';
    }
  }
}

function applyBootstrap(settings) {
  if ($("siteTitle")) {
    $("siteTitle").textContent =
      settings.siteName || settings.headerTitle || "SEVEN NURSES";
  }

  if ($("siteSub")) {
    $("siteSub").textContent =
      settings.subtitle || "ONLINE EXAM SYSTEM";
  }

  if ($("footer")) {
    $("footer").textContent =
      settings.footerText || "© SEVEN NURSES";
  }

  if ($("notice")) {
    $("notice").textContent = settings.notice || "";
    $("notice").classList.toggle("hidden", !settings.notice);
  }

  if ($("logo")) {
    const logo = $("logo");

    if (settings.logoUrl) {
      logo.src = settings.logoUrl;
      logo.style.display = "block";
      logo.style.cursor = "pointer";
      logo.title = "Open logo";

      logo.onclick = () => {
        window.open(
          settings.logoUrl,
          "_blank",
          "noopener,noreferrer"
        );
      };
    } else {
      logo.style.display = "none";
    }
  }

  if (settings.backgroundUrl) {
    document.body.style.backgroundImage =
      `url("${String(settings.backgroundUrl).replace(/"/g, "%22")}")`;

    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundAttachment = "fixed";
    document.body.style.backgroundPosition = "center";
  }
}

async function loadExams() {
  const select = $("examSelect");

  if (select) {
    select.innerHTML =
      '<option value="">লগইন করে পরীক্ষা নির্বাচন করুন</option>';
  }
}

async function studentLogin() {
  const name = $("studentName")?.value.trim() || "";
  const pin = $("pin")?.value.trim() || "";

  if (!name || !pin) {
    toast("আপনার নাম ও Exam PIN দিন।");
    return;
  }

  const button = $("startBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "যাচাই হচ্ছে...";
  }

  try {
    const login = await api("/api/student/login", {
      method: "POST",
      body: JSON.stringify({ name, pin })
    });

    if (!login.token) {
      throw new Error("লগইন টোকেন পাওয়া যায়নি।");
    }

    localStorage.setItem("sn_student_token", login.token);
    localStorage.setItem(
      "sn_student",
      JSON.stringify(login.student || { name })
    );

    student = login.student || { name };

    await loadStudentExams();
  } catch (error) {
    toast(error.message);

    if (button) {
      button.disabled = false;
      button.textContent = "Start Examination";
    }
  }
}

async function loadStudentExams() {
  try {
    exams = await api("/api/student/exams");

    if (!Array.isArray(exams)) {
      exams = [];
    }

    const select = $("examSelect");

    if (!select) {
      throw new Error("পরীক্ষা নির্বাচন করার ঘর পাওয়া যায়নি।");
    }

    select.innerHTML = exams.length
      ? exams.map(exam => `
          <option value="${esc(exam.id)}">
            ${esc(exam.title)} — ${esc(exam.duration)} মিনিট
          </option>
        `).join("")
      : '<option value="">কোনো সক্রিয় পরীক্ষা নেই</option>';

    if (!exams.length) {
      toast("এখন কোনো Active Examination নেই।");
      return;
    }

    await startExam(select.value || exams[0].id);
  } catch (error) {
    toast(error.message);

    if ($("startBtn")) {
      $("startBtn").disabled = false;
      $("startBtn").textContent = "Start Examination";
    }
  }
}

async function startExam(id) {
  if (!id) {
    toast("একটি পরীক্ষা নির্বাচন করুন।");
    return;
  }

  try {
    const data = await api(
      "/api/student/exam/" + encodeURIComponent(id)
    );

    currentExam =
      data.exam ||
      exams.find(exam => exam.id === id) ||
      { id, title: id, duration: 30 };

    questions = Array.isArray(data.questions) ? data.questions : [];
    answers = {};
    submitted = false;

    if (!questions.length) {
      toast("এই পরীক্ষায় কোনো প্রশ্ন নেই।");
      return;
    }

    if ($("login")) $("login").classList.add("hidden");
    if ($("exam")) $("exam").classList.remove("hidden");
    if ($("result")) $("result").classList.add("hidden");

    if ($("examName")) {
      $("examName").textContent =
        currentExam.title || "Examination";
    }

    if ($("questionCounter")) {
      $("questionCounter").textContent =
        `${questions.length}টি প্রশ্ন`;
    }

    renderQuestions();

    const duration = Number(currentExam.duration || 30);
    startTimer(Math.max(1, duration) * 60);
  } catch (error) {
    toast("পরীক্ষা শুরু করা যায়নি: " + error.message);
  }
}

function renderQuestions() {
  const container = $("questions");

  if (!container) {
    toast("প্রশ্ন দেখানোর এলাকা HTML-এ পাওয়া যায়নি।");
    return;
  }

  container.innerHTML = questions.map((question, index) => {
    const options = question.options || {};
    const type = String(question.type || "").toLowerCase();

    return type === "mcq"
      ? renderMCQ(question, index, options)
      : renderTrueFalse(question, index, options);
  }).join("");

  // MCQ input events
  container.querySelectorAll("[data-mcq-qid]").forEach(input => {
    input.addEventListener("change", () => {
      setMCQAnswer(input.dataset.mcqQid, input.value);
    });
  });

  // True/False input events
  container.querySelectorAll("[data-tf-qid]").forEach(input => {
    input.addEventListener("change", () => {
      setAnswer(
        input.dataset.tfQid,
        input.dataset.tfKey,
        input.value === "true"
      );
    });
  });
}

function renderMCQ(question, index, options) {
  const questionId = String(question.id ?? index);
  const keys = ["A", "B", "C", "D"];

  return `
    <div class="question-box" data-question-id="${esc(questionId)}">
      <div class="question-heading">
        Q${index + 1}. ${esc(question.question || "")}
      </div>

      ${question.imageUrl ? `
        <img
          class="question-image"
          src="${esc(question.imageUrl)}"
          alt="Question image"
          loading="lazy"
        >
      ` : ""}

      <div class="mcq-options">
        ${keys.map(key => {
          const option = options[key];

          if (!option) return "";

          const checked =
            answers[questionId] === key ? "checked" : "";

          return `
            <label class="mcq-option">
              <input
                type="radio"
                name="q_${esc(questionId)}"
                value="${key}"
                data-mcq-qid="${esc(questionId)}"
                ${checked}
              >
              <span>
                <b>${key}.</b> ${esc(option.text || "")}
              </span>
            </label>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderTrueFalse(question, index, options) {
  const questionId = String(question.id ?? index);
  const keys = ["A", "B", "C", "D", "E"];

  return `
    <div class="question-box" data-question-id="${esc(questionId)}">
      <div class="question-heading">
        Q${index + 1}. ${esc(question.question || "")}
      </div>

      ${question.imageUrl ? `
        <img
          class="question-image"
          src="${esc(question.imageUrl)}"
          alt="Question image"
          loading="lazy"
        >
      ` : ""}

      ${keys.map(key => {
        const option = options[key];

        if (!option) return "";

        const currentAnswer = answers[questionId]?.[key];

        return `
          <div class="statement">
            <div class="statement-text">
              <b>${key}.</b> ${esc(option.text || "")}
            </div>

            <div class="tf-row">
              <label class="tf-label">
                <input
                  type="radio"
                  name="q_${esc(questionId)}_${key}"
                  value="true"
                  data-tf-qid="${esc(questionId)}"
                  data-tf-key="${key}"
                  ${currentAnswer === true ? "checked" : ""}
                >
                <span class="true-choice">TRUE</span>
              </label>

              <label class="tf-label">
                <input
                  type="radio"
                  name="q_${esc(questionId)}_${key}"
                  value="false"
                  data-tf-qid="${esc(questionId)}"
                  data-tf-key="${key}"
                  ${currentAnswer === false ? "checked" : ""}
                >
                <span class="false-choice">FALSE</span>
              </label>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function setAnswer(questionId, key, value) {
  if (!answers[questionId]) {
    answers[questionId] = {};
  }

  answers[questionId][key] = value;
}

function setMCQAnswer(questionId, value) {
  answers[questionId] = value;
}

function startTimer(totalSeconds) {
  clearInterval(timerId);

  secondsLeft = totalSeconds;
  paintTimer();

  timerId = setInterval(() => {
    secondsLeft--;
    paintTimer();

    if (secondsLeft <= 0) {
      clearInterval(timerId);
      toast("সময় শেষ! পরীক্ষা জমা দেওয়া হচ্ছে...");
      submitExam(true);
    }
  }, 1000);
}

function paintTimer() {
  const timer = $("timer");

  if (!timer) return;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  timer.textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  timer.classList.remove("hidden");

  if (secondsLeft <= 60) {
    timer.classList.add("timer-warning");
  } else {
    timer.classList.remove("timer-warning");
  }
}

async function submitExam(autoSubmit = false) {
  if (submitted) return;

  if (!autoSubmit && !confirm("আপনি কি পরীক্ষা জমা দিতে চান?")) {
    return;
  }

  submitted = true;
  clearInterval(timerId);

  const submitButtons = document.querySelectorAll(
    '[onclick*="submitExam"], [data-submit-exam]'
  );

  submitButtons.forEach(button => {
    button.disabled = true;
  });

  try {
    const result = await api("/api/student/submit", {
      method: "POST",
      body: JSON.stringify({
        examId: currentExam.id,
        answers
      })
    });

    showResult(result);
  } catch (error) {
    submitted = false;
    toast("ফলাফল জমা দেওয়া যায়নি: " + error.message);

    submitButtons.forEach(button => {
      button.disabled = false;
    });
  }
}

function showResult(result) {
  if ($("timer")) $("timer").classList.add("hidden");
  if ($("exam")) $("exam").classList.add("hidden");
  if ($("result")) $("result").classList.remove("hidden");

  const status = String(result.status || "").toUpperCase();
  const passed = status === "PASS";
  const review = Array.isArray(result.review) ? result.review : [];

  const resultContainer = $("result");

  if (!resultContainer) {
    toast("ফলাফল দেখানোর এলাকা HTML-এ পাওয়া যায়নি।");
    return;
  }

  resultContainer.innerHTML = `
    <div class="card result-card">
      <div class="section-title">পরীক্ষার ফলাফল</div>

      <div class="result-score">
        ${esc(result.score)} / ${esc(result.total)}
      </div>

      <div class="${passed ? "pass" : "fail"} result-status">
        ${passed ? "অভিনন্দন! আপনি PASS করেছেন" : "দুঃখিত! আপনি FAIL করেছেন"}
      </div>

      <div class="stats">
        <div class="stat">
          <b>${esc(result.percentage ?? 0)}%</b>
          <span>শতকরা নম্বর</span>
        </div>

        <div class="stat">
          <b>${esc(result.grade ?? "-")}</b>
          <span>গ্রেড</span>
        </div>

        <div class="stat">
          <b>${esc(result.passMark ?? "-")}</b>
          <span>পাস নম্বর</span>
        </div>

        <div class="stat">
          <b>${esc(result.rank ?? "-")}</b>
          <span>অবস্থান / র‍্যাঙ্ক</span>
        </div>

        <div class="stat">
          <b>${esc(result.totalExaminees ?? "-")}</b>
          <span>মোট পরীক্ষার্থী</span>
        </div>

        <div class="stat">
          <b>${esc(student?.name || "")}</b>
          <span>শিক্ষার্থীর নাম</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="review-title">উত্তরপত্র ও সঠিক উত্তর</div>

      ${
        review.length
          ? review.map((item, index) => renderReview(item, index)).join("")
          : '<div class="empty">উত্তর পর্যালোচনা পাওয়া যায়নি।</div>'
      }
    </div>

    <button class="btn btn-blue" id="backToLogin" type="button">
      শিক্ষার্থী লগইনে ফিরে যান
    </button>
  `;

  $("backToLogin")?.addEventListener("click", () => {
    window.location.href = "/";
  });

  resultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderReview(item, index) {
  const options = item.options || {};
  const question = questions[index] || {};
  const questionId = String(question.id ?? index);
  const type = String(item.type || question.type || "").toLowerCase();
  const originalAnswer = answers[questionId];

  const unanswered = type === "mcq"
    ? !originalAnswer
    : !originalAnswer || Object.keys(originalAnswer).length === 0;

  const isCorrect = !!item.isCorrect;
  const cardClass = unanswered
    ? "unanswered"
    : isCorrect
      ? "correct"
      : "wrong";

  const questionText = item.question || question.question || "";
  const questionImage = item.imageUrl || question.imageUrl || "";

  if (type === "mcq") {
    const selected =
      item.selectedAnswer ||
      item.answer ||
      item.selected ||
      (typeof originalAnswer === "string" ? originalAnswer : "");

    const correct =
      item.correctAnswer ||
      (typeof item.correct === "string" ? item.correct : "") ||
      Object.keys(options).find(key => options[key]?.correct === true) ||
      Object.keys(question.options || {}).find(
        key => question.options[key]?.correct === true
      ) ||
      "";

    return `
      <div class="review-item ${cardClass}">
        <div class="review-q">
          Q${esc(item.number ?? index + 1)}. ${esc(questionText)}
        </div>

        ${questionImage ? `
          <img
            class="question-image"
            src="${esc(questionImage)}"
            alt="Question image"
            loading="lazy"
          >
        ` : ""}

        ${
          unanswered
            ? '<div class="answer-not-given">আপনার উত্তর: দেওয়া হয়নি</div>'
            : `<div class="your-answer">আপনার উত্তর: ${esc(selected)}</div>`
        }

        <div class="review-opt">
          ${["A", "B", "C", "D"].map(key => {
            const option = options[key] || question.options?.[key] || {};
            const selectedOption = selected === key;
            const correctOption = correct === key ||
              option.correct === true;

            let classes = "review-option";

            if (correctOption) classes += " correct-option";
            if (selectedOption && !correctOption) {
              classes += " wrong-option";
            }

            return `
              <div class="${classes}">
                <b>${key}.</b> ${esc(option.text || "")}

                ${selectedOption ? '<strong> — আপনার উত্তর</strong>' : ""}
                ${correctOption ? '<span class="correct-text"> — সঠিক উত্তর</span>' : ""}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  return `
    <div class="review-item ${cardClass}">
      <div class="review-q">
        Q${esc(item.number ?? index + 1)}. ${esc(questionText)}
      </div>

      ${questionImage ? `
        <img
          class="question-image"
          src="${esc(questionImage)}"
          alt="Question image"
          loading="lazy"
        >
      ` : ""}

      ${
        unanswered
          ? '<div class="answer-not-given">আপনার উত্তর: দেওয়া হয়নি</div>'
          : ""
      }

      <div class="review-opt">
        ${["A", "B", "C", "D", "E"].map(key => {
          const option = options[key] || question.options?.[key] || {};

          const correctValue = !!option.correct;
          const hasAnswer = Object.prototype.hasOwnProperty.call(
            originalAnswer || {},
            key
          );
          const selectedValue = hasAnswer
            ? originalAnswer[key]
            : option.selected;

          const selectedLabel = selectedValue === true
            ? "TRUE"
            : selectedValue === false
              ? "FALSE"
              : "দেওয়া হয়নি";

          const correctLabel = correctValue ? "TRUE" : "FALSE";
          const statementCorrect =
            hasAnswer && selectedValue === correctValue;

          return `
            <div class="review-option ${
              statementCorrect ? "correct-option" :
              hasAnswer ? "wrong-option" : "unanswered-option"
            }">
              <b>${key}.</b> ${esc(option.text || "")}
              <div>
                আপনার উত্তর:
                <strong>${esc(selectedLabel)}</strong>
                |
                সঠিক উত্তর:
                <span class="correct-text">${correctLabel}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

window.studentLogin = studentLogin;
window.submitExam = submitExam;
window.setAnswer = setAnswer;
window.setMCQAnswer = setMCQAnswer;

init();
