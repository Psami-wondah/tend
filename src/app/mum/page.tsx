import { redirect } from "next/navigation";

/** Old link: the person's screen now lives at /me, whoever they are. */
export default function MumRedirect() {
  redirect("/me");
}
