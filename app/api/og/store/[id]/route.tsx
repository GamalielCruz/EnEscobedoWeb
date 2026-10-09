import { ImageResponse } from "next/og";
import { buildUrl } from "@/lib/urls";
import { sanitizeText } from "@/lib/utils";
import { urlFor } from "@/sanity/lib/image";
import { getStoreById } from "@/sanity/lib/products/getStoreById";

const size = { width: 1200, height: 630 };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = await getStoreById(id);
  const storeName = sanitizeText(store?.name) || "Restaurante en ElMenu.site";
  const coverUrl = store?.coverImage
    ? urlFor(store.coverImage).width(1200).height(630).fit("crop").format("jpg").url()
    : "";
  const storeLogoUrl = store?.image
    ? urlFor(store.image).width(220).height(220).fit("crop").format("jpg").url()
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "linear-gradient(135deg, #132135 0%, #263b57 100%)",
          color: "white",
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(19,33,53,0.08) 20%, rgba(19,33,53,0.92) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 46,
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          {storeLogoUrl ? (
            <img
              src={storeLogoUrl}
              alt=""
              width={116}
              height={116}
              style={{
                width: 116,
                height: 116,
                objectFit: "cover",
                borderRadius: 58,
                border: "5px solid white",
                background: "white",
              }}
            />
          ) : null}
          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.05 }}>
              {storeName}
            </span>
            <span style={{ marginTop: 10, fontSize: 25, opacity: 0.9 }}>
              Consulta el menú y pide en línea
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 240,
              height: 82,
              padding: "12px 18px",
              borderRadius: 18,
              background: "white",
            }}
          >
            <img
              src={buildUrl("/logo.svg")}
              alt="ElMenu.site"
              width={210}
              height={63}
              style={{ width: 210, height: 63, objectFit: "contain" }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    }
  );
}
