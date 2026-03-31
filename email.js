const nodemailer = require('nodemailer');
const { pool } = require('./db');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function formatDate(date) {
  const d = new Date(String(date).substring(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(time) {
  return time.substring(0, 5);
}

async function getCourseName() {
  try {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key = 'course_name'`);
    return rows[0]?.value || 'קביעת פגישה עם המרצה';
  } catch { return 'קביעת פגישה עם המרצה'; }
}

async function sendBookingConfirmation({ student, slot }) {
  const dateStr = formatDate(slot.date);
  const timeStr = formatTime(slot.start_time);
  const courseName = await getCourseName();

  await transporter.sendMail({
    from: `"${courseName}" <${process.env.GMAIL_USER}>`,
    to: student.email,
    subject: `אישור קביעת פגישה – ${courseName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">אישור קביעת פגישה</h2>
        <p>שלום ${student.name},</p>
        <p>פגישתך נקבעה בהצלחה!</p>
        <p><strong>קורס:</strong> ${courseName}</p>
        <p><strong>תאריך:</strong> ${dateStr}</p>
        <p><strong>שעה:</strong> ${timeStr}</p>
        <p>אם תרצה לבטל או לשנות את הפגישה, אנא היכנס למערכת.</p>
        <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר</p>
      </div>
    `,
  });

  await transporter.sendMail({
    from: `"${courseName}" <${process.env.GMAIL_USER}>`,
    to: process.env.LECTURER_EMAIL,
    subject: `פגישה חדשה – ${student.name} | ${courseName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">פגישה חדשה נקבעה</h2>
        <p><strong>קורס:</strong> ${courseName}</p>
        <p><strong>סטודנט:</strong> ${student.name}</p>
        <p><strong>אימייל:</strong> ${student.email}</p>
        <p><strong>תאריך:</strong> ${dateStr}</p>
        <p><strong>שעה:</strong> ${timeStr}</p>
      </div>
    `,
  });
}

async function sendCancellationConfirmation({ student, slot }) {
  const dateStr = formatDate(slot.date);
  const timeStr = formatTime(slot.start_time);
  const courseName = await getCourseName();

  await transporter.sendMail({
    from: `"${courseName}" <${process.env.GMAIL_USER}>`,
    to: student.email,
    subject: `ביטול פגישה – ${courseName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">ביטול פגישה</h2>
        <p>שלום ${student.name},</p>
        <p>פגישתך בוטלה.</p>
        <p><strong>קורס:</strong> ${courseName}</p>
        <p><strong>תאריך:</strong> ${dateStr}</p>
        <p><strong>שעה:</strong> ${timeStr}</p>
        <p>תוכל לקבוע פגישה חדשה דרך המערכת.</p>
        <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר</p>
      </div>
    `,
  });

  await transporter.sendMail({
    from: `"${courseName}" <${process.env.GMAIL_USER}>`,
    to: process.env.LECTURER_EMAIL,
    subject: `ביטול פגישה – ${student.name} | ${courseName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">פגישה בוטלה</h2>
        <p><strong>קורס:</strong> ${courseName}</p>
        <p><strong>סטודנט:</strong> ${student.name}</p>
        <p><strong>אימייל:</strong> ${student.email}</p>
        <p><strong>תאריך:</strong> ${dateStr}</p>
        <p><strong>שעה:</strong> ${timeStr}</p>
      </div>
    `,
  });
}

async function sendRescheduleConfirmation({ student, oldSlot, newSlot }) {
  const oldDateStr = formatDate(oldSlot.date);
  const oldTimeStr = formatTime(oldSlot.start_time);
  const newDateStr = formatDate(newSlot.date);
  const newTimeStr = formatTime(newSlot.start_time);
  const courseName = await getCourseName();

  await transporter.sendMail({
    from: `"${courseName}" <${process.env.GMAIL_USER}>`,
    to: student.email,
    subject: `שינוי מועד פגישה – ${courseName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">שינוי מועד פגישה</h2>
        <p>שלום ${student.name},</p>
        <p>מועד פגישתך שונה בהצלחה!</p>
        <p><strong>קורס:</strong> ${courseName}</p>
        <p><strong>מועד קודם:</strong> ${oldDateStr} ${oldTimeStr}</p>
        <p><strong>מועד חדש:</strong> ${newDateStr} ${newTimeStr}</p>
        <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר</p>
      </div>
    `,
  });
}

async function sendBroadcast({ students, message, subject }) {
  const courseName = await getCourseName();
  const emailSubject = subject || `הודעה מהמרצה – ${courseName}`;

  for (const student of students) {
    await transporter.sendMail({
      from: `"${courseName}" <${process.env.GMAIL_USER}>`,
      to: student.email,
      subject: emailSubject,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2 style="color: #1B2A6B;">הודעה מהמרצה</h2>
          <p>שלום ${student.name},</p>
          <div style="white-space: pre-line; padding: 12px; background: #f5f5f5; border-radius: 6px; margin: 12px 0;">${message}</div>
          <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר – ${courseName}</p>
        </div>
      `,
    });
  }
}

module.exports = { sendBookingConfirmation, sendCancellationConfirmation, sendRescheduleConfirmation, sendBroadcast };
