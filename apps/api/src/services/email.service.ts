import { Resend } from "resend";
import { config } from "../config";

const resend = new Resend(config.RESEND_API_KEY);

interface EmailOptions {
  to:      string;
  subject: string;
  html:    string;
}

async function sendEmail(opts: EmailOptions): Promise<void> {
  const { error } = await resend.emails.send({
    from:    `${config.RESEND_FROM_NAME} <${config.RESEND_FROM_EMAIL}>`,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
}

export async function sendVerificationEmail(
  email: string,
  name:  string,
  url:   string
): Promise<void> {
  await sendEmail({
    to:      email,
    subject: "تأكيد البريد الإلكتروني | Verify Your Email",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 12px;">
        <h1 style="color: #2563eb; font-size: 24px;">مرحباً ${name || ""}!</h1>
        <p style="font-size: 16px; line-height: 1.6;">شكراً لتسجيلك في منصتنا. انقر على الزر أدناه لتأكيد بريدك الإلكتروني.</p>
        <a href="${url}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; margin: 20px 0;">تأكيد البريد الإلكتروني</a>
        <p style="color: #94a3b8; font-size: 14px;">إذا لم تنشئ حساباً، يمكنك تجاهل هذا البريد.</p>
        <p style="color: #94a3b8; font-size: 12px;">الرابط صالح لمدة 24 ساعة.</p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await sendEmail({
    to:      email,
    subject: "مرحباً في منصة الذكاء الاصطناعي 👋",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 12px;">
        <h1 style="color: #2563eb;">مرحباً ${name || ""} 🎉</h1>
        <p style="font-size: 16px; line-height: 1.6;">تم تفعيل حسابك بنجاح. يمكنك الآن الوصول إلى أفضل نماذج الذكاء الاصطناعي.</p>
        <p style="font-size: 16px;">لبدء الاستخدام، احصل على كود شحن وابدأ محادثتك الأولى!</p>
        <a href="${process.env.FRONTEND_URL}/ar/billing" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; margin: 20px 0;">شحن الرصيد</a>
      </div>
    `,
  });
}

export async function sendLowBalanceEmail(email: string, credits: number): Promise<void> {
  await sendEmail({
    to:      email,
    subject: "⚠️ رصيدك منخفض",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 12px;">
        <h1 style="color: #f59e0b;">⚠️ تنبيه: رصيد منخفض</h1>
        <p style="font-size: 16px;">لديك <strong>${(credits / 1_000_000).toFixed(0)} رصيد</strong> فقط متبقٍ في حسابك.</p>
        <p style="font-size: 16px;">اشحن حسابك الآن لتجنب انقطاع الخدمة.</p>
        <a href="${process.env.FRONTEND_URL}/ar/billing" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold; margin: 20px 0;">شحن الرصيد الآن</a>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, url: string): Promise<void> {
  await sendEmail({
    to:      email,
    subject: "إعادة تعيين كلمة المرور",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 12px;">
        <h1 style="color: #2563eb;">إعادة تعيين كلمة المرور</h1>
        <p style="font-size: 16px;">طلبت إعادة تعيين كلمة مرورك. انقر على الزر أدناه.</p>
        <a href="${url}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; margin: 20px 0;">إعادة تعيين كلمة المرور</a>
        <p style="color: #94a3b8; font-size: 14px;">الرابط صالح لمدة ساعة واحدة. إذا لم تطلب ذلك، تجاهل هذا البريد.</p>
      </div>
    `,
  });
}
