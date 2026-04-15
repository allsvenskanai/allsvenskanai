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

function formatTeamName(name) {
  if (!name) return "Okänt lag";

  const cleanedName = String(name).replace(/\s+W$/i, "").trim();

  return TEAM_NAME_OVERRIDES[cleanedName] || cleanedName;
}
