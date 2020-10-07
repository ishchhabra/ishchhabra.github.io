import React, { Component } from "react";
export default class ContactUs extends Component {
  render() {
    let resumeData = this.props.resumeData;
    return (
      <section id="contact">
        <div className="row section-head">
          <div className="ten columns">
            <p className="lead">
              Feel free to contact me for any work or suggestions below
            </p>
          </div>
        </div>
        
        <div className="row">
          <form className="ten columns">
            <div class="flex">
              <input id="input-name" type="text" placeholder="name" />
              <input id="input-email" type="text" placeholder="email" />
            </div>
            <div class="flex">
              <textarea id="input-message" placeholder="write your message..."/>
            </div>
            <div class="flex">
              <button id="submit-button" type="submit">Send Message</button>
            </div>
          </form>
        </div>
      </section>
    );
  }
}
