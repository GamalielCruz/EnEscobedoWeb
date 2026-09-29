import { normalizeCustomerAddress } from "@/lib/customer-address";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const readAddresses = async (userId: string) => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const addresses = Array.isArray(user.privateMetadata.addresses)
    ? user.privateMetadata.addresses
        .map(normalizeCustomerAddress)
        .filter((address) => address?.id !== "5-de-febrero-64")
    : [];

  return {
    client,
    addresses,
    activeAddressId:
      typeof user.privateMetadata.activeAddressId === "string"
        ? user.privateMetadata.activeAddressId
        : "",
  };
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { addresses, activeAddressId } = await readAddresses(userId);
  return NextResponse.json({ addresses, activeAddressId });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const address = normalizeCustomerAddress(body?.address);
  if (!address) return NextResponse.json({ error: "Dirección inválida" }, { status: 400 });

  const { client, addresses } = await readAddresses(userId);
  const saved = { ...address, id: address.id || crypto.randomUUID() };
  const next = [
    saved,
    ...addresses.filter(
      (item) =>
        item?.id !== saved.id &&
        item?.formattedAddress.toLocaleLowerCase("es-MX") !==
          saved.formattedAddress.toLocaleLowerCase("es-MX")
    ),
  ].slice(0, 8);

  await client.users.updateUserMetadata(userId, {
    privateMetadata: { addresses: next, activeAddressId: saved.id },
  });

  return NextResponse.json({ address: saved, addresses: next });
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id") || "";
  const { client, addresses, activeAddressId } = await readAddresses(userId);
  const next = addresses.filter((address) => address?.id !== id);

  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      addresses: next,
      activeAddressId: activeAddressId === id ? next[0]?.id || null : activeAddressId,
    },
  });
  return NextResponse.json({ addresses: next });
}
