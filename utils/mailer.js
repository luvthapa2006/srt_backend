// ========================================
// MAILER.JS - Email Utility using Resend
// Resend works perfectly on Render free tier
// 3,000 free emails/month — resend.com
// ========================================

const { Resend } = require('resend');

// ─────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function fmtCurrency(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

// ─────────────────────────────────────────
// Helper to build alternating detail rows
// ─────────────────────────────────────────
function buildDetailRow(label, value) {
  return `
    <tr>
      <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:38%;vertical-align:top;">
        ${label}
      </td>
      <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:13px;font-weight:500;">
        ${value}
      </td>
    </tr>`;
}

// ─────────────────────────────────────────
// Build HTML email
// ─────────────────────────────────────────
function buildTicketHTML(booking, schedule) {
  const seats       = booking.seatNumbers.join(', ');
  const seatCount   = booking.seatNumbers.length;
  const origin      = schedule?.origin      || 'N/A';
  const destination = schedule?.destination || 'N/A';
  const busName     = schedule?.busName     || 'Shree Ram Travels';
  const busType     = schedule?.type        || '';
  const depDate     = schedule?.departureTime ? fmtDate(schedule.departureTime) : 'N/A';
  const depTime     = schedule?.departureTime ? fmtTime(schedule.departureTime) : 'N/A';
  const arrTime     = schedule?.arrivalTime   ? fmtTime(schedule.arrivalTime)   : 'N/A';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation – Shree Ram Travels</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <img src="https://i.ibb.co/TqYcn7bS/shree-ram-logo-new.png" alt="Shree Ram Travels" height="60" style="display:block;margin:0 auto 12px;">
              <p style="color:#94a3b8;margin:0;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Booking Confirmation</p>
            </td>
          </tr>

          <!-- SUCCESS BANNER -->
          <tr>
            <td style="background:#10b981;padding:20px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background:rgba(255,255,255,0.2);border-radius:50%;width:44px;height:44px;text-align:center;vertical-align:middle;font-size:22px;color:white;">✓</td>
                  <td style="padding-left:14px;text-align:left;">
                    <p style="margin:0;color:white;font-size:20px;font-weight:700;">Your seat is confirmed!</p>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Payment received successfully. Have a safe journey 🙏</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:white;padding:36px 40px;">

              <p style="margin:0 0 24px;font-size:16px;color:#1e293b;">Dear <strong>${booking.customerName}</strong>,</p>
              <p style="margin:0 0 32px;font-size:14px;color:#475569;line-height:1.7;">
                Thank you for choosing <strong>Shree Ram Travels</strong>. Your booking is confirmed and your seats are reserved.
              </p>

              <!-- TOKEN -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:20px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;">Booking Token</p>
                    <p style="margin:0;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:3px;font-family:monospace;">${booking.bookingToken}</p>
                    <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Use this token to track or manage your booking</p>
                  </td>
                </tr>
              </table>

              <!-- ROUTE CARD -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:1px;text-transform:uppercase;">Journey Route</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align:left;">
                          <p style="margin:0;color:white;font-size:22px;font-weight:800;">${origin}</p>
                          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${depTime}</p>
                        </td>
                        <td style="text-align:center;padding:0 12px;">
                          <p style="margin:0;color:rgba(255,255,255,0.6);font-size:22px;">→</p>
                        </td>
                        <td style="text-align:right;">
                          <p style="margin:0;color:white;font-size:22px;font-weight:800;">${destination}</p>
                          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${arrTime}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- TICKET DETAILS -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr style="background:#f8fafc;">
                  <td colspan="2" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">🎫 Ticket Details</p>
                  </td>
                </tr>
                ${buildDetailRow('🚌 Bus Name', busName)}
                ${buildDetailRow('🏷️ Bus Type', busType)}
                ${buildDetailRow('📅 Travel Date', depDate)}
                ${buildDetailRow('🕐 Departure', depTime)}
                ${buildDetailRow('🕐 Arrival', arrTime)}
                ${buildDetailRow('💺 Seat(s)', `<strong style="color:#667eea">${seats}</strong> (${seatCount} seat${seatCount > 1 ? 's' : ''})`)}
                ${buildDetailRow('💰 Amount Paid', `<strong style="color:#10b981;font-size:16px">${fmtCurrency(booking.totalAmount)}</strong>`)}
                ${buildDetailRow('📱 Phone', booking.phone)}
                ${buildDetailRow('✉️ Email', booking.email)}
              </table>

              <!-- IMPORTANT NOTES -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#92400e;">⚠️ Important Instructions</p>
                    <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:2;">
                      <li>Arrive at the boarding point <strong>15 minutes before</strong> departure</li>
                      <li>Carry a valid <strong>government-issued photo ID</strong> (Aadhaar/PAN/Passport)</li>
                      <li>Show this email or your <strong>booking token</strong> at boarding</li>
                      <li>Pickup &amp; Office: <strong>New Shri Ram Travels, VPO Nathuawala, Dehradun, UK 248004</strong></li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- FIND US / MAP -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#3730a3;">📍 How to Find Us</p>
                    <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.7;">
                      <strong>New Shri Ram Travels</strong><br>
                      VPO Nathuawala, Dehradun, Uttarakhand 248004
                    </p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <a href="https://maps.google.com/maps?q=shree+ram+tours+and+travels+Dehradun&z=15"
                             style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:10px 20px;border-radius:7px;font-size:13px;font-weight:600;margin-right:8px;">
                            🗺️ Open in Google Maps
                          </a>
                        </td>
                        <td>
                          <a href="https://maps.google.com/maps?q=shree+ram+tours+and+travels+Dehradun&z=15&dirflg=d"
                             style="display:inline-block;background:white;color:#4f46e5;text-decoration:none;padding:10px 20px;border-radius:7px;font-size:13px;font-weight:600;border:1.5px solid #4f46e5;">
                            🧭 Get Directions
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- TRACK BUTTON -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="https://ramjibus.com" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
                      🔍 Track Your Booking
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
              <p style="margin:0;font-size:14px;color:#64748b;line-height:1.7;text-align:center;">
                Thank you for travelling with us.<br>
                For support, reply to this email or call
                <a href="tel:+919870995956" style="color:#667eea;text-decoration:none;">+91 98709 95956</a>
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#1e293b;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;">📍 New Shri Ram Travels, VPO Nathuawala, Dehradun, Uttarakhand 248004</p>
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;">
                <a href="mailto:mj732411@gmail.com" style="color:#667eea;text-decoration:none;">mj732411@gmail.com</a>
                &nbsp;|&nbsp;
                <a href="tel:+919870995956" style="color:#667eea;text-decoration:none;">+91 98709 95956</a>
              </p>
              <p style="margin:12px 0 0;color:#475569;font-size:11px;">© 2025 Shree Ram Travels. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────
// Build plain-text fallback
// ─────────────────────────────────────────
function buildTicketText(booking, schedule) {
  const origin      = schedule?.origin      || 'N/A';
  const destination = schedule?.destination || 'N/A';
  const busName     = schedule?.busName     || 'Shree Ram Travels';
  const depDate     = schedule?.departureTime ? fmtDate(schedule.departureTime) : 'N/A';
  const depTime     = schedule?.departureTime ? fmtTime(schedule.departureTime) : 'N/A';

  return `
SHREE RAM TRAVELS – BOOKING CONFIRMED
======================================
Dear ${booking.customerName},
Your booking is confirmed! 🎉

BOOKING TOKEN : ${booking.bookingToken}
--------------------------------------
Route         : ${origin} → ${destination}
Bus           : ${busName}
Date          : ${depDate}
Departure     : ${depTime}
Seats         : ${booking.seatNumbers.join(', ')}
Amount Paid   : ${fmtCurrency(booking.totalAmount)}
--------------------------------------
Passenger     : ${booking.customerName}
Phone         : ${booking.phone}
Email         : ${booking.email}

IMPORTANT:
• Arrive 15 minutes before departure
• Carry a valid photo ID
• Show this email or booking token at boarding

Track your booking: https://ramjibus.com
Contact: mj732411@gmail.com | +91 98709 95956
Address: New Shri Ram Travels, VPO Nathuawala, Dehradun, UK 248004
Maps: https://maps.google.com/maps?q=shree+ram+tours+and+travels+Dehradun&z=15

© 2025 Shree Ram Travels
  `.trim();
}

// ─────────────────────────────────────────
// MAIN EXPORT — sendBookingConfirmation
// Uses Resend API (no SMTP, works on Render)
// ─────────────────────────────────────────
async function sendBookingConfirmation(booking, schedule) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️  RESEND_API_KEY not set – skipping email');
      return { success: false, reason: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from:    'Shree Ram Travels <bookings@ramjibus.com>',
      to:      [booking.email],
      subject: `✅ Booking Confirmed – ${booking.bookingToken} | Shree Ram Travels`,
      text:    buildTicketText(booking, schedule),
      html:    buildTicketHTML(booking, schedule)
    });

    if (error) {
      console.error('❌ Resend error:', error);
      return { success: false, reason: error.message };
    }

    console.log(`✅ Confirmation email sent to ${booking.email} | ID: ${data.id}`);
    return { success: true, messageId: data.id };

  } catch (err) {
    console.error('❌ Email sending failed:', err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = { sendBookingConfirmation };