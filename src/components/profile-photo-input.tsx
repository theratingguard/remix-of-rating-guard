import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EncodedProfilePhoto = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

const acceptedTypes: EncodedProfilePhoto["contentType"][] = ["image/jpeg", "image/png", "image/webp"];

function isAcceptedContentType(value: string): value is EncodedProfilePhoto["contentType"] {
  return acceptedTypes.some((contentType) => contentType === value);
}

export function ProfilePhotoInput({
  onChange,
  disabled = false,
}: {
  onChange: (photo: EncodedProfilePhoto | null) => void;
  disabled?: boolean;
}) {
  const [encoding, setEncoding] = useState(false);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      onChange(null);
      return;
    }
    if (!isAcceptedContentType(file.type)) {
      event.target.value = "";
      onChange(null);
      toast.error("Choose a JPEG, PNG, or WebP profile photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = "";
      onChange(null);
      toast.error("Profile photos must be smaller than 5 MB.");
      return;
    }

    setEncoding(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32_768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      onChange({
        contentType: file.type,
        base64: btoa(binary),
      });
    } catch (error) {
      event.target.value = "";
      onChange(null);
      toast.error(error instanceof Error ? error.message : "Could not read the profile photo.");
    } finally {
      setEncoding(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="new-user-profile-photo">Profile Photo</Label>
      <Input
        id="new-user-profile-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        disabled={disabled || encoding}
        onChange={(event) => void selectPhoto(event)}
      />
      <p className="text-xs text-muted-foreground">
        JPEG, PNG, or WebP · maximum 5 MB{encoding ? " · Preparing photo…" : ""}
      </p>
    </div>
  );
}
