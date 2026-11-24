"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "./ui/button";

/** Offers the Android app on an Android phone, once the app is released (NEXT_PUBLIC_ANDROID_APP=1). */
export function OpenInApp({ kind, token }: { kind: "join" | "join-channel"; token: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(process.env.NEXT_PUBLIC_ANDROID_APP === "1" && /Android/.test(navigator.userAgent)); }, []);
  return show ? <ButtonLink variant="outline" className="h-9 px-4" href={"famsync://" + kind + "?token=" + token}>Open in the FamSync app</ButtonLink> : null;
}
