import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: Number(process.env.SMTP_PORT ?? 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function enviarMailRecuperacion(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genapi.cl";
  const link = `${baseUrl}/recuperar-clave/${token}`;

  await transporter.sendMail({
    from: `"GENAPI" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Recuperación de contraseña — GENAPI",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a1628;color:#ffffff;padding:32px;border-radius:12px;">
        <h2 style="color:#c9a84c;margin-bottom:8px;">GENAPI</h2>
        <p style="color:#a8b4c8;margin-bottom:24px;">Recibimos una solicitud para restablecer tu contraseña.</p>
        <a href="${link}" style="display:inline-block;background:#c9a84c;color:#0a1628;padding:12px 24px;border-radius:6px;font-weight:700;text-decoration:none;">
          Restablecer contraseña
        </a>
        <p style="color:#a8b4c8;margin-top:24px;font-size:13px;">
          Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.
        </p>
        <p style="color:#a8b4c8;font-size:13px;">O copia este link en tu navegador:<br/>
          <span style="color:#c9a84c;word-break:break-all;">${link}</span>
        </p>
      </div>
    `,
  });
}
