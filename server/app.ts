import AuthenticatingConcept from "./concepts/authenticating";
import CitingConcept from "./concepts/citing";
import LabelingConcept from "./concepts/labeling";
import PostingConcept from "./concepts/posting";
import SessioningConcept from "./concepts/sessioning";

// The app is a composition of concepts instantiated here
// and synchronized together in `routes.ts`.
const TrueTideCategories = [
  "Politics & Governance",
  "Race & Identity",
  "Free Speech & Censorship",
  "Social Justice & Activism",
  "Religion & Belief Systems",
  "Health & Lifestyle",
  "Economic Inequality & Class Issues",
  "Language & Communication",
  "Gender & Sexuality",
];

export const Sessioning = new SessioningConcept();
export const Authing = new AuthenticatingConcept("users");
export const Posting = new PostingConcept("posts");
export const Labeling = new LabelingConcept("post", TrueTideCategories);
export const Citing = new CitingConcept("postCitations");
