const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(time) {
  return time.substring(0, 5);
}

async function sendBookingConfirmation({ student, slot }) {
  const dateStr = formatDate(slot.date);
  const timeStr = formatTime(slot.start_time);

  await transporter.sendMail({
    from: `"מערכת קביעת פגישות" <${process.env.GMAIL_USER}>`,
    to: student.email,
    subject: 'אישור קביעת פגישה - מכללת ספיר',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">אישור קביעת פגישה</h2>
        <p>שלום ${student.name},</p>
        <p>פגישתך נקבעה בהצלחה!</p>
        <p><strong>תאריך:</strong> ${dateStr}</p>
        <p><strong>שעה:</strong> ${timeStr}</p>
        <p>אם תרצה לבטל או לשנות את הפגישה, אנא היכנס למערכת.</p>
        <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר</p>
      </div>
    `,
  });

  await transporter.sendMail({
    from: `"מערכת קביעת פגישות" <${process.env.GMAIL_USER}>`,
    to: process.env.LECTURER_EMAIL,
    subject: `פגישה חדשה - ${student.name}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">פגישה חדשה נקבעה</h2>
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

  await transporter.sendMail({
    from: `"מערכת קביעת פגישות" <${process.env.GMAIL_USER}>`,
    to: student.email,
    subject: 'ביטול פגישה - מכללת ספיר',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">ביטול פגישה</h2>
        <p>שלום ${student.name},</p>
        <p>פגישתך בוטלה.</p>
        <p><strong>תאריך:</strong> ${dateStr}</p>
        <p><strong>שעה:</strong> ${timeStr}</p>
        <p>תוכל לקבוע פגישה חדשה דרך המערכת.</p>
        <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר</p>
      </div>
    `,
  });

  await transporter.sendMail({
    from: `"מערכת קביעת פגישות" <${process.env.GMAIL_USER}>`,
    to: process.env.LECTURER_EMAIL,
    subject: `ביטול פגישה - ${student.name}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">פגישה בוטלה</h2>
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

  await transporter.sendMail({
    from: `"מערכת קביעת פגישות" <${process.env.GMAIL_USER}>`,
    to: student.email,
    subject: 'שינוי מועד פגישה - מכללת ספיר',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif;">
        <h2 style="color: #1B2A6B;">שינוי מועד פגישה</h2>
        <p>שלום ${student.name},</p>
        <p>מועד פגישתך שונה בהצלחה!</p>
        <p><strong>מועד קודם:</strong> ${oldDateStr} ${oldTimeStr}</p>
        <p><strong>מועד חדש:</strong> ${newDateStr} ${newTimeStr}</p>
        <p style="color: #1B2A6B; font-weight: bold;">מכללת ספיר</p>
      </div>
    `,
  });
}

module.exports = { sendBookingConfirmation, sendCancellationConfirmation, sendRescheduleConfirmation };
