/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SDK do Claude roda no servidor (chat de dados, /dev e o módulo Estudos); não deve ser empacotado.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  // Estudos recebe PDFs/áudios grandes; quadros do Excalidraw podem ter imagens embutidas.
  experimental: { serverActions: { bodySizeLimit: "1gb" }, proxyClientMaxBodySize: "1gb", proxyTimeout: 300_000 },
  // Trilhas (app de aprendizado em 127.0.0.1:4300) atrás do login do Hub. proxyTimeout alto: o Mentor (IA) pode levar minutos.
  async rewrites() {
    return [{ source: "/trilhas-app/:path*", destination: "http://127.0.0.1:4300/trilhas-app/:path*" }];
  },
};

export default nextConfig;
