;jQuery(function($) {
  "use strict";

  var
    pluginName = "inlineTokenizer",
    tokenData = "token",
    selectors = {},
    classNames = {
      wrapper  : "token-wrapper",
      item     : "token-item",
      itemInput: "token-item-input",
      remove   : "token-item-remove",
      input    : "token-input",
      results  : "token-results",
      result   : "token-result",
      disabled : "token-disabled",
      original : "token-input-original",
      selected : "token-selected",
      loading  : "token-loading"
    },
    inputEvent = "oninput" in window ? "input" : "keyup keydown",
    events = {},
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

  $.each(["add", "remove", "selectResult", "search", "beforeSearch", "results"], function(i, eventName) {
    events[eventName] = eventName + "." + pluginName;
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

  function InlineTokenizer(input, options) {
    switch (input.type) {
      case "select-multiple":
        var selectedOptions = input.selectedOptions || $.filter("[selected]", input.options);
        options.cache = mapTokens(input.options, options.cache);
        options.populateWith = mapTokens(selectedOptions, options.populateWith);
        this.init(input, options);
        break;
      case "text":
        options.cache = mapTokens([], options.cache);
        options.populateWith = mapTokens([], options.populateWith);
        this.init(input, options);
        break;
    };
  }

  InlineTokenizer.prototype = {
    init: function(input, options) {
      var
        $originalInput = $(input),
        $wrapper = $(options.createWrapper({
          placeholder: options.placeholder || $originalInput.attr("placeholder"),
          wideResults: options.wideResults
        })),
        $input = $wrapper.find(selectors.input),
        $itemInput = $wrapper.find(selectors.itemInput),
        $results = $wrapper.find(selectors.results),
        inputName = $originalInput.attr("name") || options.inputName,
        cache = TokenList(options.cache.concat(options.populateWith)),
        selectedTokens = TokenList(options.populateWith),
        searchRequest = null,
        publish = $.fn.trigger.bind($originalInput);

      function searchCache(q) {
        return $.Deferred(function(deferred) {
          var results = options.searchProvider(cache.tokens, q);
          deferred[results.length ? "resolve" : "reject"](results, q);
        });
      }

      function searchServer(q) {
        var searchOptions = {
          url: options.searchUrl,
          dataType: options.searchDataType,
          data: {}
        };

        if (options.beforeSearch) {
          searchOptions = options.beforeSearch(q, searchOptions);
        } else {
          searchOptions.data[options.searchParameter] = q;
        }

        publish(events.beforeSearch, [q, searchOptions]);

        return $.ajax(searchOptions);
      }

      function populateResults(results, q) {
        $results.html(options.formatResults(results, q, selectedTokens.ids()));
      }

      function appendResults(results, q) {
        if (results && results.length) {
          var $prevResults = $results.find("li").not(selectors.disabled);
          $results.append(options.formatResults(results, q, selectedTokens.ids()));
          // if (!$prevResults.length) selectResult($results.find("li").not(selectors.disabled).first());
        }
      }

      function clearResults() {
        $results.empty();
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
          publish(events.remove, [$(token)]);
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

      function scrollToResult($result) {
        var
          scrollTop,
          containerHeight = $results.height(),
          visibleTop = $results.scrollTop(),
          visibleBottom = containerHeight + visibleTop,
          resultTop = $result.position().top + $results.scrollTop(),
          resultBottom = resultTop + $result.outerHeight();

        if (resultBottom >= visibleBottom) {
          scrollTop = resultBottom - containerHeight;
          $results.scrollTop(scrollTop > 0 ? scrollTop : 0);
        } else if (resultTop < visibleTop) {
          $results.scrollTop(resultTop);
        }

      }

      function selectResult($result) {
        if ($result.length) {
          $result.addClass(classNames.selected);
          scrollToResult($result);
        }
      }

      function selectNextResult() {
        var $next, $selectedResult = getSelectedResult();
        if ($selectedResult.length) {
          deselectResult($selectedResult);
          $next = $selectedResult.next();
          if ($next.length) {
            selectResult($next);
          } else {
            selectResult($results.find(selectors.result).first());
          }
        } else {
          selectResult($results.find(selectors.result).first());
        }
      }

      function selectPrevResult() {
        var $prev, $selectedResult = getSelectedResult();
        if ($selectedResult.length) {
          deselectResult($selectedResult);
          $prev = $selectedResult.prev();
          if ($prev.length) {
            selectResult($prev);
          } else {
            selectResult($results.find(selectors.result).last());
          }
        } else {
          selectResult($results.find(selectors.result).last());
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

        if (!q || q.length < options.minChars) {
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
              publish(events.results, [results, q]);
            });

          publish(events.search, [q, searchRequest]);
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
              publish(events.selectResult, [getSelectedResult()]);
              e.preventDefault();
              break;
            case KEY.DOWN:
              if ($results.is(":visible")) {
                selectNextResult();
              } else {
                displayCachedTokens();
                // Select first result
                selectResult($results.find("li").not(selectors.disabled).first());
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
        .on("mouseenter", selectors.result, function() {
          scrollToResult($(this));
        })
        .on("click", selectors.result, function() {
          publish(events.selectResult, [$(this)]);
        });

      $wrapper
        //.on("click", displayCachedTokens)
        .on(events.selectResult, function(e, $result) {
          if ($result.length === 0) return false;
          var result = $result.data(tokenData);
          if (!$.isPlainObject(result)) result = JSON.parse(result);
          result.inputName = inputName;
          if (result && selectedTokens.get(result.id) === null) {
            result.data = JSON.stringify(result);
            publish(events.add, [result]);
          }
        })
        .on(events.add, function(e, result) {
          $itemInput.before(options.formatToken(result));
          selectedTokens.add(result);
          $input.val("");
          clearResults();
        })
        .on(events.remove, function(e, $token) {
          selectedTokens.remove($token.data(tokenData).id);
          $token.remove();
        })
        .on(events.beforeSearch, function() {
          $wrapper.addClass(classNames.loading);
        })
        .on(events.search, function(e, q, request) {
          request.always(function() {
            $wrapper.removeClass(classNames.loading);
          });
        })
        .on(events.results, function(e, results, q) {
          appendResults(results, q);
        })
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

      this.elements = {
        wrapper: $wrapper,
        originalInput: $originalInput,
        input: $input,
        itemInput: $itemInput,
        results: $results
      };

      this.options = options;
      this.cache = cache;

    }
  }

  $.Token = Token;
  
  $.fn[pluginName] = function(options) {
    return this.each(function(i, input) {
      if (!$.data(input, pluginName)) {
        $.data(input, pluginName, new InlineTokenizer(input, $.extend({}, $.fn[pluginName].defaults, options)));
      }
    });
  }

  $.fn[pluginName].defaults = {
    isRTL: true,
    placeholder: "חיפוש",
    minChars: 2,
    searchDataType: "json",
    resultsDelay: 100,
    searchDelay: 200,
    searchParameter: "q",
    searchUrl: null,
    parseResults: null,
    wideResults: false,
    searchProvider: function(tokens, q) {
      return $.map(tokens, function(token) {
        if (token.name.toLowerCase().indexOf(q) !== -1) return token;
      });
    },
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
        return new Handlebars.SafeString(String(text).replace(rQuery, function(match) {
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
  };

});