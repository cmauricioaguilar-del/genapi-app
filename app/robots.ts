import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/registro", "/login"],
        disallow: ["/dashboard/", "/api/"],
      },
    ],
    sitemap: "https://genapi.cl/sitemap.xml",
  };
}
