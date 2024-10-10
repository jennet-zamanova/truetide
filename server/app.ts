import AuthenticatingConcept from "./concepts/authenticating";
import CitingConcept from "./concepts/citing";
import FriendingConcept from "./concepts/friending";
import LabelingConcept from "./concepts/labeling";
import PostingConcept from "./concepts/posting";
import SessioningConcept from "./concepts/sessioning";

// The app is a composition of concepts instantiated here
// and synchronized together in `routes.ts`.
export const Sessioning = new SessioningConcept();
export const Authing = new AuthenticatingConcept("users");
export const Posting = new PostingConcept("posts");
export const Friending = new FriendingConcept("friends");
export const Labeling = new LabelingConcept("post");
export const Citing = new CitingConcept("postCitations");
