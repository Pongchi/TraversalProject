const { Builder } = require("selenium-webdriver");
const chromeDriver = require("selenium-webdriver/chrome");

const chromeOptions = new chromeDriver.Options();
chromeOptions.addArguments("--disable-gpu");
chromeOptions.addArguments("--no-sandbox");
chromeOptions.addArguments(`proxy-server=${'127.0.0.1:8080'}`)
chromeOptions.addArguments('--ignore-certificate-errors')

const browser = async () => {
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();

  try {
    await driver.get("https://www.changwon.ac.kr/portal/lo/login/ssoPage.do?mi=13566");
  } catch (err) {
    console.log(`ERROR: ${err}`);
  } finally {
  }
};

module.exports = browser;