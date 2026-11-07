import { NextResponse } from "next/server";
import { InputError, RpcError } from "./rpc";

export function errorResponse(error: unknown) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof RpcError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong while checking this transaction." },
    { status: 500 },
  );
}
