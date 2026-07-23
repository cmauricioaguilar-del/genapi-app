import { Resend } from "resend";

export async function enviarMailRecuperacion(email: string, token: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genapi.cl";
  const link = `${baseUrl}/recuperar-clave/${token}`;

  await resend.emails.send({
    from: "GENAPI <noreply@genapi.cl>",
    to: email,
    subject: "Recuperación de contraseña — GENAPI",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a1628;color:#ffffff;padding:32px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:16px;">
          <img src="https://genapi.cl/logo.svg" alt="GENAPI" width="70" height="70" style="display:inline-block;" />
          <h2 style="color:#c9a84c;margin:8px 0 0;letter-spacing:4px;font-size:22px;">GENAPI</h2>
        </div>
        <p style="color:#a8b4c8;margin-bottom:24px;text-align:center;">Recibimos una solicitud para restablecer tu contraseña.</p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${link}" style="display:inline-block;background:#c9a84c;color:#0a1628;padding:12px 24px;border-radius:6px;font-weight:700;text-decoration:none;">
            Restablecer contraseña
          </a>
        </div>
        <p style="color:#a8b4c8;font-size:13px;text-align:center;">
          Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.
        </p>
        <p style="color:#a8b4c8;font-size:12px;text-align:center;">O copia este link en tu navegador:<br/>
          <a href="${link}" style="color:#c9a84c;word-break:break-all;">${link}</a>
        </p>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0;" />
        <div style="text-align:center;">
          <a href="https://genapi.cl" style="color:#c9a84c;font-size:12px;text-decoration:none;margin:0 12px;">genapi.cl</a>
          <a href="https://www.nexxus-consulting.com" style="color:#a8b4c8;font-size:12px;text-decoration:none;margin:0 12px;">nexxus-consulting.com</a>
        </div>
      </div>
    `,
  });
}
