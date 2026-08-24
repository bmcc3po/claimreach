export const runtime = "edge";
import { redirect } from "next/navigation";

export const metadata = { title: "Questionnaire" };

export default function M6QuestionnaireRedirect() {
  redirect("/m6/pfs");
}
