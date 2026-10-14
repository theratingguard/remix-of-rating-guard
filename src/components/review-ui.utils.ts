export const ratingTone = (rating: number) =>
  rating >= 4 ? "text-risk-normal" : rating >= 3 ? "text-risk-medium" : "text-risk-high";
