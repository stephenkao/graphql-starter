/**
 * This script helps to configure all the required
 * environment variables such as application URL (origin),
 * Google Cloud project IDs, database name, etc. Usage example:
 *
 *   $ yarn setup
 *
 * @copyright 2016-present Kriasoft (https://git.io/vMINh)
 */

const fs = require("fs");
const dotenv = require("dotenv");
const spawn = require("cross-spawn");
const inquirer = require("inquirer");

const environments = {
  prod: "production",
  test: "test (QA)",
  dev: "development",
};

function replace(filename, searchValue, replaceValue) {
  let text = fs.readFileSync(filename, "utf8");
  if (text.match(searchValue)) {
    text = text.replace(searchValue, replaceValue);
    fs.writeFileSync(filename, text, "utf8");
    return true;
  } else {
    return `Failed to find ${searchValue} in ${filename}`;
  }
}

const questions = [
  {
    type: "confirm",
    name: "setup",
    message:
      "Configure this project for production, test (QA), and shared development environments?",
    default: true,
  },
  {
    type: "input",
    name: "domain",
    message: "Domain name where the app will be hosted:",
    when: (answers) => answers.setup,
    default() {
      const { parsed } = dotenv.config({ path: "env/.env.prod" });
      return new URL(parsed.APP_ORIGIN).hostname;
    },
    validate(domain) {
      if (!domain.match(/^\w[\w-.]{0,61}\w\.[\w]{2,}$/)) {
        return "Requires a valid domain name.";
      }

      const appOrigin = /^(APP_ORIGIN)=.*$/m;
      const appName = /^(APP_NAME)=.*$/m;
      const appNameValue = domain
        .substring(0, domain.lastIndexOf("."))
        .replace(/\./g, "_");

      return (
        replace("env/.env.prod", appOrigin, `$1=https://${domain}`) &&
        replace("env/.env.test", appOrigin, `$1=https://test.${domain}`) &&
        replace("env/.env.dev", appOrigin, `$1=https://dev.${domain}`) &&
        replace("env/.env", appName, `$1=${appNameValue}`)
      );
    },
  },
  {
    type: "input",
    name: "pkg",
    message: "GCS bucket for the app bundles:",
    when: (answers) => answers.setup,
    default: ({ domain }) => `pkg.${domain}`,
    validate(value) {
      if (!value.match(/^\w[\w-.]*\w$/)) {
        return "Requires a valid GCS bucket name.";
      }
      const search = /^(PKG_BUCKET)=.*/m;
      return replace("env/.env", search, `$1=${value}`);
    },
  },
  ...Object.keys(environments).map((env) => ({
    type: "input",
    name: `gcp_project_${env}`,
    message: `GCP project ID for ${environments[env]} (${env}):`,
    when: (answers) => answers.setup,
    default: ({ domain }) =>
      domain
        .substring(0, domain.lastIndexOf("."))
        .replace(/\./g, "_")
        .toLowerCase() + `_${env}`,
    validate(value) {
      const gcp = /^(GOOGLE_CLOUD_PROJECT)=.*/gm;
      const db = /^(PGDATABASE)=.*/gm;
      const localDb = value.replace(/[-_](dev|development)/, "_local");
      return (
        replace(`env/.env.${env}`, gcp, `$1=${value}`) &&
        replace(`env/.env.${env}`, db, `$1=${value}`) &&
        (env === "dev"
          ? replace(`env/.env.local`, gcp, `$1=${value}`) &&
            replace(`env/.env.local`, db, `$1=${localDb}`)
          : true)
      );
    },
  })),
  {
    type: "confirm",
    name: "clean",
    message: "Do you want to remove this setup script?",
    when: (answers) => answers.setup,
    default: false,
  },
];

async function done(answers) {
  if (answers.clean) {
    fs.unlinkSync("./setup.js");
    let text = fs.readFileSync("./package.json", "utf8");
    text = text.replace(/\n\s+"setup": ".*?\n/s, "\n");
    fs.writeFileSync("./package.json", text, "utf8");
    spawn.sync("yarn", ["remove", "inquirer", "cross-spawn"]);
  }

  if (answers.setup) {
    console.log(`  `);
    console.log(
      `  Done! Now you can migrate the database and launch the app by running:`,
    );
    console.log(`  `);
    console.log(`  $ yarn db:migrate`);
    console.log(`  $ yarn start`);
    console.log(`  `);
  } else {
    console.log(`  No problem. You can run this script at any time later.`);
  }
}

inquirer
  .prompt(questions)
  .then(done)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
