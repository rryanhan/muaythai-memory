import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";

const profile = {
  displayName: "Nong-O Gaiyanghadao",
  avatarUrl: "https://example.com/avatar.webp",
};

describe("ProfileAvatar", () => {
  it("loads list avatars lazily at the browser's default fetch priority", () => {
    const { container } = render(<ProfileAvatar profile={profile} />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("fetchpriority", "auto");
  });

  it("loads prominent avatars eagerly at high priority", () => {
    const { container } = render(<ProfileAvatar profile={profile} priority />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("fetchpriority", "high");
  });

  it("renders only the initials fallback when there is no avatar image", () => {
    const { container, getByText } = render(
      <ProfileAvatar profile={{ ...profile, avatarUrl: null }} />,
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(getByText("NG")).toBeInTheDocument();
  });
});
