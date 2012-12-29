;(function($) {
  "use strict";

  var
    defaults = {
      isRTL: true,
      placeholder: "חיפוש",
      resultsDelay: 100,
      searchDelay: 200,
      searchParameter: "q",
      searchUrl: null,
      parseResults: null,
      createWrapper: Handlebars.compile( $("#tokenWrapperTemplate").html() ),
      formatToken: Handlebars.compile( $("#tokenTemplate").html() ),
      formatTokens: function(items, inputName) {
        var options = this;
        return $.map(items, function(item) {
          item.inputName = inputName;
          return options.formatToken(item);
        }).join("\n");
      },
      formatResult: Handlebars.compile( $("#tokenResultTemplate").html() ),
      formatResults: function(results, q, selectedTokensIds) {
        var
          template = this.formatResult,
          rQuery = RegExp.Safe(q, "gi"),
          list = "";

        function wrapMatches(text) {
          return new Handlebars.SafeString(text.replace(rQuery, function(match) {
            return "<em>" + Handlebars.Utils.escapeExpression(match) + "</em>";
          }));
        }

        /*if (options.freeText) {
          list += template({
            id        : q,
            name      : wrapMatches(q),
            data      : JSON.stringify({
              id: q,
              name: q
            }),
            isSelected: false
          });
        }*/

        $.each(results, function(i, result) {
          list += template({
            id        : result.id,
            name      : q ? wrapMatches(result.name) : result.name,
            data      : JSON.stringify(result),
            isSelected: (selectedTokensIds.indexOf(result.id) !== -1)
          });
        });

        return list;
      }
    },
    selectors = {},
    classNames = {
      wrapper: "token-wrapper",
      item     : "token-item",
      itemInput: "token-item-input",
      remove   : "token-item-remove",
      input    : "token-input",
      results  : "token-results",
      result   : "token-result",
      disabled : "token-disabled",
      original : "token-input-original",
      selected : "token-selected"
    },
    dataAttrs = {
      id: "token-id",
      name: "token-name",
      result: "token-result"
    },
    inputEvent = "oninput" in window ? "input" : "keyup keydown",
    KEY = {
      BACKSPACE: 8,
      DELETE   : 46,
      ESC      : 27,
      SPACE    : 32,
      LEFT     : 37,
      UP       : 38,
      RIGHT    : 39,
      DOWN     : 40,
      ENTER    : 13
    };

  $.each(classNames, function(key, className) {
    selectors[key] = "." + className;
  });

  function Token(id, name) {
    return {
      id: id,
      name: String(name || id)
    };
  }

  function TokenList(tokens) {
    var
      tokenList = {},
      prefix = "token-";

    $.extend(tokenList, {
      tokens: {},
      add: function(token ,id) {
        if (!id) id = token.id;
        this.tokens[prefix + id] = token;
      },
      get: function(id) {
        return this.tokens[prefix + id] || null;
      },
      remove: function(id) {
        if (!id) return null;
        return delete this.tokens[prefix + id];
      },
      ids: function() {
        return $.map(this.tokens, function(token) {
          return token.id;
        });
      }
    });

    switch ($.type(tokens)) {
      case "array":
        $.each(tokens, function(i, token) {
          tokenList.add(token);
        });
        break;
      case "object":
        tokenList.tokens = tokens;
        break;
      default:
        break;
    }

    return tokenList;
  }

  function autoResizeWidth(input) {
    input.style.width = "auto";
    input.style.width = (input.scrollWidth + input.offsetWidth - input.clientWidth) + "px";
  }

  function tokenize(options) {
    var
      $originalInput = $(this),
      $wrapper = $(options.createWrapper({
        placeholder: $originalInput.attr("placeholder") || options.placeholder
      })),
      $input = $wrapper.find(selectors.input),
      $itemInput = $wrapper.find(selectors.itemInput),
      $results = $wrapper.find(selectors.results),
      inputName = $originalInput.attr("name") || options.inputName,
      cache = TokenList(options.cache.concat(options.populateWith)),
      selectedTokens = TokenList(options.populateWith),
      searchRequest = null;

    function searchCache(q) {
      return $.Deferred(function(deferred) {
        var results = $.map(cache.tokens, function(token) {
          if (token.name.toLowerCase().indexOf(q) !== -1) return token;
        });
        deferred[results.length ? "resolve" : "reject"](results, q);
      });
    }

    function searchServer(q) {
      var searchOptions = {
        url: options.searchUrl,
        data: {}
      };

      searchOptions.data[options.searchParameter] = q;

      return $.ajax(searchOptions);
    }

    function populateResults(results, q) {
      $results.html(options.formatResults(results, q, selectedTokens.ids()));

      // Select first match
      selectResult($results.find("li").not(selectors.disabled).first());
    }

    function appendResults(results, q) {
      if (results && results.length) {
        var $prevResults = $results.find("li").not(selectors.disabled);
        $results.append(options.formatResults(results, q, selectedTokens.ids()));
        if (!$prevResults.length) selectResult($results.find("li").not(selectors.disabled).first());
      }
    }

    function clearResults() {
      $results.empty();
    }

    function addToken($result) {
      if ($result.length === 0) return false;
      var result = $result.data(dataAttrs.result);
      if (!$.isPlainObject(result)) result = JSON.parse(result);
      result.inputName = inputName;
      if (result && selectedTokens.get(result.id) === null) {
        $itemInput.before(options.formatToken(result));
        selectedTokens.add(result);
        $input.val("");
        clearResults();
        return true;
      }
    }

    function selectToken($token) {
      if ($token && $token.length) {
        $token.addClass(classNames.selected);
      } else {
        deselectTokens();
      }
    }

    function removeTokens($tokens) {
      $tokens.each(function(i, token) {
        var $token = $(token);
        selectedTokens.remove($token.data(dataAttrs.id));
        $token.remove();
      });
      return !!$tokens.length;
    }

    function attemptRemoveTokens() {
      if (!removeTokens($wrapper.find(selectors.item + selectors.selected))) {
        selectToken($itemInput.prev(selectors.item));
      };
    }

    function deselectTokens() {
      $wrapper.find(selectors.item + selectors.selected).removeClass(classNames.selected);
    }

    function getSelectedResult() {
      return $results.find(selectors.selected).first();
    }

    function deselectResult($result) {
      $result.removeClass(classNames.selected);
    }

    function selectResult($result) {
      $result.addClass(classNames.selected);
    }

    function selectNextResult() {
      var $next, $selectedResult = getSelectedResult();
      if ($selectedResult.length) {
        deselectResult($selectedResult);
        $next = $selectedResult.next();
        if ($next.length) {
          selectResult($next.addClass(classNames.selected));
        } else {
          selectResult($results.find(selectors.result).first().addClass(classNames.selected));
        }
      } else {
        selectResult($results.find(selectors.result).first().addClass(classNames.selected));
      }
    }

    function selectPrevResult() {
      var $prev, $selectedResult = getSelectedResult();
      if ($selectedResult.length) {
        deselectResult($selectedResult);
        $prev = $selectedResult.prev();
        if ($prev.length) {
          selectResult($prev.addClass(classNames.selected));
        } else {
          selectResult($results.find(selectors.result).last().addClass(classNames.selected));
        }
      } else {
        selectResult($results.find(selectors.result).last().addClass(classNames.selected));
      }
    }

    function displayCachedTokens() {
      populateResults($.map(cache.tokens, function(token) {
        return token;
      }));
    }

    var delayedClearResults = debounce(function() {
      if ($input.is(":focus") === false && $results.is(":hover") === false) clearResults();
    }, options.resultsDelay);

    var search = debounce(function(q) {
      q = String(q).toLowerCase();

      if (!q) {
        clearResults();
        return;
      }

      searchCache(q)
        .done(populateResults)
        .fail(clearResults);

      if (options.searchUrl) {
        // Cancel previous request
        if (searchRequest) searchRequest.abort();

        searchRequest = searchServer(q)
          .success(function(results) {
            if (options.parseResults) results = options.parseResults(results);
            appendResults(results, q);
          });
      }

    }, options.searchDelay);

    // Bind events
    $input
      .on(inputEvent, function(e) {
        // Search cache & server
        search($input.val().trim());

        // Adjust width while typing
        autoResizeWidth(this);
      })
      .on("click", displayCachedTokens)
      .on("blur", function(e) {
        delayedClearResults();
        deselectTokens();
      })
      // Enable navigating results
      .on("keydown", function(e) {
        switch (e.keyCode) {
          case KEY.ENTER:
            addToken(getSelectedResult());
            e.preventDefault();
            break;
          case KEY.DOWN:
            if ($results.is(":visible")) {
              selectNextResult();
            } else {
              displayCachedTokens();
            }
            deselectTokens();
            e.preventDefault();
            break;
          case KEY.UP:
            selectPrevResult();
            e.preventDefault();
            break;
          case KEY.DELETE:
          case KEY.BACKSPACE:
            if ($input.val() === "") {
                attemptRemoveTokens();
                clearResults();
              }
            break;
          case KEY.ESC:
            clearResults();
            deselectTokens();
            break;
          default:
            deselectTokens();
            break;
        }
      });

    $results
      .on("mouseleave", delayedClearResults)
      .on("click", selectors.result, function() {
        addToken($(this));
      });

    $wrapper
      //.on("click", displayCachedTokens)
      .on("click", function() {
        $input.focus();
      })
      // .on("click", selectors.item, function() {
      //   $(this).toggleClass(classNames.selected);
      // })
      .on("click", selectors.remove, function() {
        removeTokens($(this).closest(selectors.item));
      });

    // Populate list
    $wrapper.prepend(options.formatTokens(selectedTokens.tokens, inputName));

    // Hide and replace original text input
    $originalInput
      .addClass(classNames.original)
      .removeAttr("name")
      .replaceWith($wrapper);

    $input
      // Prevent input overflow
      .css("max-width", $wrapper.width())
      .attr("size", 1)
      // Append before original input
      .before($originalInput);

    return $wrapper;
  }

  // Utils
  (function(replace) {
    var escape = [/[\-\[\]\/\\{}()*+?.^$|]/g, '\\$&'];
    RegExp.Safe = function(pattern, flags) {
      return new RegExp(replace.apply(String(pattern), escape), flags);
    }
  }(String.prototype.replace));

  // https://github.com/bestiejs/lodash/blob/v1.0.0-rc.3/lodash.js#L3499
  function debounce(func, wait, immediate) {
    var args, result, thisArg, timeoutId;

    function delayed() {
      timeoutId = null;
      if (!immediate) {
        result = func.apply(thisArg, args);
      }
    }
    return function() {
      var isImmediate = immediate && !timeoutId;
      args = arguments;
      thisArg = this;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(delayed, wait);

      if (isImmediate) {
        result = func.apply(thisArg, args);
      }
      return result;
    };
  }

  function mapTokens(nodeList, tokens) {
    var tokensArray = [];
    switch ($.type(tokens)) {
      case "object":
        $.each(tokens, function(id, name) {
          tokensArray.push(Token(id, name));
        });
        break;
      case "array":
        $.each(tokens, function(i, token) {
          switch ($.type(token)) {
            case "string":
              tokensArray.push(Token(token));
              break;
            case "object":
              tokensArray.push(Token(token.id, token.name));
              break;
          }
        });
        break;
    }

    return $.map(nodeList || [], function(node) {
      var $node = $(node);
      return Token($node.val(), $node.text());
    }).concat(tokensArray);
  }

  function initTokenizer(input, options) {
    switch (input.type) {
      case "select-multiple":
        var selectedOptions = input.selectedOptions || $.filter("[selected]", input.options);
        options.cache = mapTokens(input.options, options.cache);
        options.populateWith = mapTokens(selectedOptions, options.populateWith);
        return tokenize.call(input, options);
      case "text":
        options.cache = mapTokens([], options.cache);
        options.populateWith = mapTokens([], options.populateWith);
        return tokenize.call(input, options);
    };
  }

  $.Token = Token;
  
  $.fn.inlineTokenizer = function(options) {
    return this.map(function(i, input) {
      return initTokenizer(input, $.extend({}, defaults, options));
    });
  }

}(jQuery));