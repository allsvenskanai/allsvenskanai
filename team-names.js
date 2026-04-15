const TEAM_NAME_OVERRIDES = {
  // Herr
  "Sirius": "IK Sirius",
  "Djurgården": "Djurgårdens IF",
  "Malmö": "Malmö FF",
  "Häcken": "BK Häcken",
  "Elfsborg": "IF Elfsborg",
  "Örgryte": "Örgryte IS",
  "AIK": "AIK",
  "Västerås": "Västerås SK",
  "Hammarby": "Hammarby IF",
  "Degerfors": "Degerfors IF",
  "Brommapojkarna": "IF Brommapojkarna",
  "Kalmar": "Kalmar FF",
  "GAIS": "GAIS",
  "Halmstad": "Halmstads BK",
  "Göteborg": "IFK Göteborg",
  "Mjällby": "Mjällby AIF",

  // Dam
  "BK Häcken": "BK Häcken",
  "Malmö FF": "Malmö FF",
  "Rosengård": "FC Rosengård",
  "Norrköping": "IFK Norrköping",
  "Kristianstad": "Kristianstads DFF",
  "Eskilstuna": "Eskilstuna United",
  "Piteå": "Piteå IF",
  "Uppsala": "IK Uppsala Fotboll",
  "Vittsjö": "Vittsjö GIK",
  "Växjö": "Växjö DFF"
};

const TEAM_BRANDING_OVERRIDES = {
  234951: {
    name: "IK Uppsala Fotboll",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/c/c8/IK_Uppsala_logo.svg/250px-IK_Uppsala_logo.svg.png"
  }
};

function getTeamBrandingOverride(teamId) {
  if (teamId === null || teamId === undefined || teamId === "") return null;

  return TEAM_BRANDING_OVERRIDES[String(teamId)] || TEAM_BRANDING_OVERRIDES[Number(teamId)] || null;
}

function formatTeamName(name, teamId) {
  const brandingOverride = getTeamBrandingOverride(teamId);
  if (brandingOverride?.name) return brandingOverride.name;

  if (!name) return "Okänt lag";

  const cleanedName = String(name).replace(/\s+W$/i, "").trim();

  return TEAM_NAME_OVERRIDES[cleanedName] || cleanedName;
}

function formatTeamLogo(logo, teamId) {
  const brandingOverride = getTeamBrandingOverride(teamId);

  return brandingOverride?.logo || logo || "";
}
